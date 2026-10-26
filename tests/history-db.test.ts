import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearHistoryDb,
  closeHistoryDbForTests,
  deleteRunDb,
  getRunDb,
  listRunsDb,
  saveRunDb,
  updateRunNoteDb,
} from "@/lib/server/history-db";
import { HISTORY_LIMIT } from "@/lib/history";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";

let dir = "";

beforeEach(() => {
  closeHistoryDbForTests();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "roundtable-history-"));
  process.env.ROUNDTABLE_DB_PATH = path.join(dir, "roundtable.sqlite");
});

afterEach(() => {
  closeHistoryDbForTests();
  delete process.env.ROUNDTABLE_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("SQLite history", () => {
  it("persists, updates notes, deletes and clears runs", () => {
    const saved = saveRunDb(FIXTURE_SNAPSHOT, { id: "one", savedAt: 100, note: "first" });
    expect(saved).toMatchObject({ id: "one", savedAt: 100, note: "first", score: 80 });
    expect(listRunsDb().map((r) => r.id)).toEqual(["one"]);

    expect(updateRunNoteDb("one", "  reviewed  ")?.note).toBe("reviewed");
    const resaved = saveRunDb({ ...FIXTURE_SNAPSHOT, createdAt: 999 }, { id: "one", savedAt: 200 });
    expect(resaved.note).toBe("reviewed");
    expect(getRunDb("one")?.savedAt).toBe(200);

    expect(deleteRunDb("one")).toBe(true);
    expect(deleteRunDb("one")).toBe(false);
    expect(listRunsDb()).toEqual([]);

    saveRunDb(FIXTURE_SNAPSHOT, { id: "again" });
    clearHistoryDb();
    expect(listRunsDb()).toEqual([]);
  });

  it("preserves Persian and structured Decision Record JSON exactly", () => {
    const fa = "آزمایش ذخیره‌سازی RoundTable با موفقیت انجام شد";
    const snapshot = {
      ...FIXTURE_SNAPSHOT,
      prompt: fa,
      finalSummary: fa,
      judge: {
        ...FIXTURE_SNAPSHOT.judge!,
        decisionRecord: {
          consensus: fa,
          disagreements: "اختلاف محدود",
          uniqueInsights: "نکته منحصربه‌فرد",
          recommendedDecision: "پیشنهاد نهایی",
          uncertainty: "نیاز به بررسی بیشتر",
        },
      },
    };
    saveRunDb(snapshot, { id: "fa" });
    const loaded = getRunDb("fa")!;
    expect(loaded.snapshot.prompt).toBe(fa);
    expect(loaded.snapshot.finalSummary).toBe(fa);
    expect(loaded.snapshot.judge?.decisionRecord?.consensus).toBe(fa);
  });

  it(`keeps only the newest ${HISTORY_LIMIT} runs`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
      saveRunDb(FIXTURE_SNAPSHOT, { id: `r-${i}`, savedAt: i });
    }
    const runs = listRunsDb();
    expect(runs).toHaveLength(HISTORY_LIMIT);
    expect(runs[0].id).toBe(`r-${HISTORY_LIMIT + 2}`);
    expect(runs.some((r) => r.id === "r-0")).toBe(false);
  });
});
