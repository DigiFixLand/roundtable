// History client binding. Production uses the server-side SQLite API.
// The legacy StorageLike path remains only as an explicit test/compatibility
// adapter; browser localStorage is no longer the production source of truth.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  HISTORY_KEY,
  clearHistory,
  deleteRun,
  getRun,
  listRuns,
  saveRun,
  subscribeHistory,
  updateRunNote,
  type HistoryEntry,
  type SaveRunExtras,
  type StorageLike,
} from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";

export type { HistoryEntry, SaveRunExtras, StorageLike } from "@/lib/history";

const EMPTY: HistoryEntry[] = [];
const isTest = process.env.NODE_ENV === "test";

/** 32-bit FNV-1a over a string, as unsigned base-36. */
function fnv1a(s: string, seed = 0x811c9dc5): string {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Stable id so re-saving one completed run updates instead of duplicating it. */
export function runKey(snapshot: SessionSnapshot): string {
  const parts: string[] = [snapshot?.engine ?? "", snapshot?.prompt ?? ""];
  for (const round of snapshot?.rounds ?? []) {
    for (const r of round.responses ?? []) parts.push(`${r.participantId}@${r.timestamp}`);
  }
  const s = parts.join("|");
  return `run-${fnv1a(s)}${fnv1a(s, 0x01000193)}`;
}

/** Legacy synchronous helper kept for StorageLike tests and old callers. */
export function saveCompletedRun(
  snapshot: SessionSnapshot,
  extras: SaveRunExtras = {},
  storage?: StorageLike | null,
): HistoryEntry | null {
  try {
    if (!snapshot || !Array.isArray(snapshot.rounds) || snapshot.rounds.length === 0) return null;
    const id = extras.id ?? runKey(snapshot);
    const note = extras.note ?? getRun(id, storage)?.note;
    return saveRun(snapshot, { ...extras, id, ...(note ? { note } : {}) }, storage);
  } catch {
    return null;
  }
}

// ── SQLite-backed production source ────────────────────────
let remoteRuns: HistoryEntry[] = EMPTY;
let remoteLoaded = false;
let remoteLoading: Promise<void> | null = null;
let remoteRevision = 0;
const remoteListeners = new Set<() => void>();

function publishRemote(next: HistoryEntry[]) {
  remoteRuns = next.length === 0 ? EMPTY : [...next].sort((a, b) => b.savedAt - a.savedAt);
  for (const listener of [...remoteListeners]) listener();
}

async function refreshRemote(force = false): Promise<void> {
  if (remoteLoading && !force) return remoteLoading;
  const revisionAtStart = remoteRevision;
  remoteLoading = (async () => {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (!response.ok) throw new Error(`History HTTP ${response.status}`);
    const data = (await response.json()) as { runs?: HistoryEntry[] };
    remoteLoaded = true;
    // Never let an older GET overwrite a newer save/note/delete mutation.
    if (revisionAtStart === remoteRevision)
      publishRemote(Array.isArray(data.runs) ? data.runs : []);
  })()
    .catch((err) => {
      console.error("Failed to load SQLite history:", err);
    })
    .finally(() => {
      remoteLoading = null;
    });
  return remoteLoading;
}

const remoteSource = {
  subscribe(listener: () => void) {
    remoteListeners.add(listener);
    if (!remoteLoaded) void refreshRemote();
    return () => remoteListeners.delete(listener);
  },
  getSnapshot: () => remoteRuns,
};

function mutateRemote(next: HistoryEntry[]) {
  remoteRevision++;
  remoteLoaded = true;
  publishRemote(next);
}

function upsertRemote(entry: HistoryEntry) {
  mutateRemote([entry, ...remoteRuns.filter((r) => r.id !== entry.id)]);
}

export async function persistCompletedRun(
  snapshot: SessionSnapshot,
  extras: SaveRunExtras = {},
): Promise<HistoryEntry | null> {
  if (!snapshot || !Array.isArray(snapshot.rounds) || snapshot.rounds.length === 0) return null;
  if (isTest) return saveCompletedRun(snapshot, extras);
  try {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, extras: { ...extras, id: extras.id ?? runKey(snapshot) } }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { entry?: HistoryEntry };
    if (!data.entry) return null;
    upsertRemote(data.entry);
    return data.entry;
  } catch (err) {
    console.error("Failed to persist completed run:", err);
    return null;
  }
}

async function removeRemote(id: string): Promise<boolean> {
  const response = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) return false;
  mutateRemote(remoteRuns.filter((r) => r.id !== id));
  return true;
}

async function updateNoteRemote(id: string, note: string): Promise<HistoryEntry | null> {
  const response = await fetch(`/api/history/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { entry?: HistoryEntry };
  if (!data.entry) return null;
  upsertRemote(data.entry);
  return data.entry;
}

async function clearRemote(): Promise<boolean> {
  const response = await fetch("/api/history", { method: "DELETE" });
  if (!response.ok) return false;
  mutateRemote([]);
  return true;
}

// ── Legacy external source (explicit StorageLike / tests) ──
interface HistorySource {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => HistoryEntry[];
}
const getServerSnapshot = (): HistoryEntry[] => EMPTY;
const DEFAULT_STORAGE_KEY = {};
const NO_STORAGE_KEY = {};
const sources = new WeakMap<object, HistorySource>();

function createLegacySource(storage: StorageLike | null | undefined): HistorySource {
  let cache: HistoryEntry[] | null = null;
  const listeners = new Set<() => void>();
  let detach: (() => void) | null = null;
  const invalidate = () => {
    cache = null;
    for (const l of [...listeners]) l();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === HISTORY_KEY) invalidate();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!detach) {
        const unsubscribe = subscribeHistory(invalidate, storage);
        const win = typeof window !== "undefined" ? window : null;
        win?.addEventListener("storage", onStorage);
        detach = () => {
          unsubscribe();
          win?.removeEventListener("storage", onStorage);
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
          cache = null;
        }
      };
    },
    getSnapshot() {
      if (cache === null) {
        const list = listRuns(storage);
        cache = list.length === 0 ? EMPTY : list;
      }
      return cache;
    },
  };
}

function legacySourceFor(storage: StorageLike | null | undefined): HistorySource {
  const key = storage === undefined ? DEFAULT_STORAGE_KEY : (storage ?? NO_STORAGE_KEY);
  let source = sources.get(key);
  if (!source) {
    source = createLegacySource(storage);
    sources.set(key, source);
  }
  return source;
}

type MaybePromise<T> = T | Promise<T>;
export interface UseHistoryResult {
  runs: HistoryEntry[];
  remove: (id: string) => MaybePromise<boolean>;
  updateNote: (id: string, note: string) => MaybePromise<HistoryEntry | null>;
  clear: () => MaybePromise<boolean>;
}

export interface SyncHistoryResult {
  runs: HistoryEntry[];
  remove: (id: string) => boolean;
  updateNote: (id: string, note: string) => HistoryEntry | null;
  clear: () => boolean;
}

export function useHistory(storage: StorageLike | null): SyncHistoryResult;
export function useHistory(): UseHistoryResult;
export function useHistory(storage: StorageLike | null | undefined): UseHistoryResult;
export function useHistory(storage?: StorageLike | null): UseHistoryResult {
  // Explicit StorageLike and test default preserve deterministic unit tests.
  const legacy = storage !== undefined || isTest;
  const source = useMemo(
    () => (legacy ? legacySourceFor(storage) : remoteSource),
    [legacy, storage],
  );
  const runs = useSyncExternalStore(source.subscribe, source.getSnapshot, getServerSnapshot);

  const remove = useCallback(
    (id: string) => (legacy ? deleteRun(id, storage) : removeRemote(id)),
    [legacy, storage],
  );
  const updateNote = useCallback(
    (id: string, note: string) => (legacy ? updateRunNote(id, note, storage) : updateNoteRemote(id, note)),
    [legacy, storage],
  );
  const clear = useCallback(
    () => (legacy ? clearHistory(storage) : clearRemote()),
    [legacy, storage],
  );

  return useMemo(() => ({ runs, remove, updateNote, clear }), [runs, remove, updateNote, clear]);
}
