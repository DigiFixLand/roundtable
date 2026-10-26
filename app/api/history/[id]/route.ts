import { NextResponse } from "next/server";
import { deleteRunDb, updateRunNoteDb } from "@/lib/server/history-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const note = (body as { note?: unknown })?.note;
  if (typeof note !== "string" || note.length > 500) {
    return NextResponse.json({ error: "Note must be a string up to 500 characters" }, { status: 400 });
  }
  const entry = updateRunNoteDb(id, note);
  if (!entry) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteRunDb(id)) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
