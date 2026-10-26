import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { HISTORY_LIMIT, titleFromPrompt, type HistoryEntry, type SaveRunExtras } from "@/lib/history";
import type { EngineType, SessionSnapshot } from "@/lib/types";

interface RunRow {
  id: string;
  title: string;
  note: string | null;
  saved_at: number;
  engine: string;
  score: number | null;
  cost: number;
  snapshot_json: string;
}

let database: DatabaseSync | null = null;

export function historyDbPath(): string {
  return process.env.ROUNDTABLE_DB_PATH?.trim() || path.join(process.cwd(), "data", "roundtable.sqlite");
}

function getDb(): DatabaseSync {
  if (database) return database;
  const filename = historyDbPath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT,
      saved_at INTEGER NOT NULL,
      engine TEXT NOT NULL,
      score REAL,
      cost REAL NOT NULL DEFAULT 0,
      snapshot_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_saved_at_idx ON runs(saved_at DESC);
  `);
  return database;
}

function validEngine(value: string): value is EngineType {
  return value === "cvp" || value === "blind-jury" || value === "adversarial";
}

function rowToEntry(row: RunRow): HistoryEntry | null {
  try {
    const snapshot = JSON.parse(row.snapshot_json) as SessionSnapshot;
    if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.rounds)) return null;
    const engine = validEngine(row.engine) ? row.engine : snapshot.engine;
    return {
      id: row.id,
      title: row.title || titleFromPrompt(snapshot.prompt ?? ""),
      ...(row.note ? { note: row.note } : {}),
      savedAt: row.saved_at,
      engine,
      score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
      cost: typeof row.cost === "number" && Number.isFinite(row.cost) ? Math.max(0, row.cost) : 0,
      snapshot,
    };
  } catch {
    return null;
  }
}

export function listRunsDb(): HistoryEntry[] {
  const rows = getDb()
    .prepare("SELECT id,title,note,saved_at,engine,score,cost,snapshot_json FROM runs ORDER BY saved_at DESC LIMIT ?")
    .all(HISTORY_LIMIT as SQLInputValue) as unknown as RunRow[];
  return rows.map(rowToEntry).filter((entry): entry is HistoryEntry => entry !== null);
}

export function getRunDb(id: string): HistoryEntry | null {
  const row = getDb()
    .prepare("SELECT id,title,note,saved_at,engine,score,cost,snapshot_json FROM runs WHERE id = ?")
    .get(id) as unknown as RunRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function saveRunDb(snapshot: SessionSnapshot, extras: SaveRunExtras = {}): HistoryEntry {
  const db = getDb();
  const savedAt = extras.savedAt ?? Date.now();
  const id = extras.id?.trim() || `run-${savedAt.toString(36)}-${randomUUID().slice(0, 8)}`;
  const previous = getRunDb(id);
  const title = extras.title?.trim() || titleFromPrompt(snapshot.prompt ?? "");
  const note = extras.note === undefined ? (previous?.note ?? null) : extras.note.trim() || null;
  const engine = snapshot.engine;
  const score = typeof snapshot.finalScore === "number" ? snapshot.finalScore : null;
  const cost = snapshot.tokenTotal?.estimatedCostUSD ?? 0;
  const snapshotJson = JSON.stringify(snapshot);
  const updatedAt = Date.now();

  db.prepare(`
    INSERT INTO runs (id,title,note,saved_at,engine,score,cost,snapshot_json,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      note=excluded.note,
      saved_at=excluded.saved_at,
      engine=excluded.engine,
      score=excluded.score,
      cost=excluded.cost,
      snapshot_json=excluded.snapshot_json,
      updated_at=excluded.updated_at
  `).run(id, title, note, savedAt, engine, score, cost, snapshotJson, updatedAt);

  db.prepare(`
    DELETE FROM runs
    WHERE id NOT IN (SELECT id FROM runs ORDER BY saved_at DESC LIMIT ?)
  `).run(HISTORY_LIMIT);

  return getRunDb(id)!;
}

export function updateRunNoteDb(id: string, note: string): HistoryEntry | null {
  const trimmed = note.trim();
  const result = getDb()
    .prepare("UPDATE runs SET note = ?, updated_at = ? WHERE id = ?")
    .run(trimmed || null, Date.now(), id);
  if (result.changes === 0) return null;
  return getRunDb(id);
}

export function deleteRunDb(id: string): boolean {
  return getDb().prepare("DELETE FROM runs WHERE id = ?").run(id).changes > 0;
}

export function clearHistoryDb(): void {
  getDb().exec("DELETE FROM runs");
}

/** Test-only hook: close the cached handle so a temp database can be removed/reopened. */
export function closeHistoryDbForTests(): void {
  database?.close();
  database = null;
}
