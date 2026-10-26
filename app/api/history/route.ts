import { NextResponse } from "next/server";
import { clearHistoryDb, listRunsDb, saveRunDb } from "@/lib/server/history-db";
import type { SaveRunExtras } from "@/lib/history";
import type { SessionSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SessionSnapshot>;
  const engine = s.engine;
  return (
    s.v === 1 &&
    typeof s.prompt === "string" &&
    (engine === "cvp" || engine === "blind-jury" || engine === "adversarial") &&
    Array.isArray(s.rounds) &&
    Array.isArray(s.participants)
  );
}

function safeExtras(value: unknown): SaveRunExtras {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const extras: SaveRunExtras = {};
  if (typeof raw.id === "string" && raw.id.length <= 200) extras.id = raw.id;
  if (typeof raw.title === "string" && raw.title.length <= 500) extras.title = raw.title;
  if (typeof raw.note === "string" && raw.note.length <= 500) extras.note = raw.note;
  if (typeof raw.savedAt === "number" && Number.isFinite(raw.savedAt))
    extras.savedAt = Math.trunc(raw.savedAt);
  return extras;
}

export async function GET() {
  return NextResponse.json({ runs: listRunsDb() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = body as { snapshot?: unknown; extras?: unknown };
  if (!validSnapshot(raw?.snapshot)) {
    return NextResponse.json({ error: "Invalid session snapshot" }, { status: 400 });
  }
  const extras = safeExtras(raw.extras);
  const entry = saveRunDb(raw.snapshot, extras);
  return NextResponse.json({ entry }, { status: 201 });
}

export async function DELETE() {
  clearHistoryDb();
  return NextResponse.json({ ok: true });
}
