import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as clearAll, GET, POST } from "@/app/api/history/route";
import { DELETE as deleteOne, PATCH } from "@/app/api/history/[id]/route";
import { closeHistoryDbForTests } from "@/lib/server/history-db";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";

let dir = "";
const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  closeHistoryDbForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roundtable-api-"));
  process.env.ROUNDTABLE_DB_PATH = path.join(dir, "roundtable.sqlite");
});

afterEach(() => {
  closeHistoryDbForTests();
  delete process.env.ROUNDTABLE_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("/api/history", () => {
  it("creates, lists, updates and deletes a persisted run", async () => {
    const created = await POST(
      jsonRequest("http://localhost/api/history", "POST", {
        snapshot: FIXTURE_SNAPSHOT,
        extras: { id: "api-run", savedAt: 123 },
      }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).entry.id).toBe("api-run");

    const listed = await GET();
    const runs = (await listed.json()).runs;
    expect(runs).toHaveLength(1);
    expect(runs[0].snapshot.prompt).toBe(FIXTURE_SNAPSHOT.prompt);

    const patched = await PATCH(
      jsonRequest("http://localhost/api/history/api-run", "PATCH", { note: "reviewed" }),
      { params: Promise.resolve({ id: "api-run" }) },
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).entry.note).toBe("reviewed");

    const removed = await deleteOne(new Request("http://localhost"), {
      params: Promise.resolve({ id: "api-run" }),
    });
    expect(removed.status).toBe(200);
    expect((await GET()).status).toBe(200);
    expect((await (await GET()).json()).runs).toEqual([]);
  });

  it("rejects malformed snapshots and overlong notes", async () => {
    const bad = await POST(
      jsonRequest("http://localhost/api/history", "POST", { snapshot: { v: 1 } }),
    );
    expect(bad.status).toBe(400);

    await POST(
      jsonRequest("http://localhost/api/history", "POST", {
        snapshot: FIXTURE_SNAPSHOT,
        extras: { id: "api-run" },
      }),
    );
    const note = await PATCH(
      jsonRequest("http://localhost/api/history/api-run", "PATCH", { note: "x".repeat(501) }),
      { params: Promise.resolve({ id: "api-run" }) },
    );
    expect(note.status).toBe(400);
  });

  it("clears all persisted history", async () => {
    await POST(
      jsonRequest("http://localhost/api/history", "POST", {
        snapshot: FIXTURE_SNAPSHOT,
        extras: { id: "one" },
      }),
    );
    expect((await (await GET()).json()).runs).toHaveLength(1);
    expect((await clearAll()).status).toBe(200);
    expect((await (await GET()).json()).runs).toEqual([]);
  });
});
