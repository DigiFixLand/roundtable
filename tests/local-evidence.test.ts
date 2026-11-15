import { describe, expect, it } from "vitest";
import { localEvidenceContext, localReferenceContext } from "@/lib/local-evidence";
import type { AttachedDocument } from "@/lib/documents";

function makeDoc(pages: string[]): AttachedDocument {
  return {
    id: "doc-example-001",
    name: "Roadmap.pdf",
    format: "pdf",
    sizeBytes: 25000,
    pages: pages.map((text, i) => ({ page: i + 1, text })),
    charCount: pages.reduce((n, s) => n + s.length, 0),
  };
}
describe("local excerpt selection", () => {
  it("preserves every page of sufficiently small documents", () => {
    const doc = makeDoc(["A small first page.", "A small second page."]);
    const context = localEvidenceContext("What is the overview?", [doc], 4000);
    expect(context).toContain("page 1");
    expect(context).toContain("page 2");
    expect(context).not.toContain("PARTIAL evidence");
  });
  it("selects relevant late pages, cites exact source and announces incomplete coverage", () => {
    const doc = makeDoc([
      "Introduction and general purpose ".repeat(40),
      "Infrastructure status and backups ".repeat(40),
      "Backup Restore SQLite is the blocking disaster recovery task. ".repeat(35),
      "Other topics and scheduling ".repeat(40),
    ]);
    const context = localEvidenceContext(
      "How will we validate Backup Restore SQLite?",
      [doc],
      1900,
    );
    expect(context).toContain("PARTIAL evidence");
    expect(context).toContain('"Roadmap.pdf"');
    expect(context).toContain("page 3");
    expect(context.length).toBeLessThan(3000);
  });
  it("reserves space for the primary report when manual AI answers are attached", () => {
    const report = makeDoc([
      "Primary report: the backup must be restored in a test environment. ".repeat(50),
    ]);
    const manual = {
      ...makeDoc(["External AI suggestion: migrate all components immediately. ".repeat(35)]),
      id: "manual-answer",
      name: "kimi-manual-answer.txt",
      format: "txt" as const,
    };
    const context = localReferenceContext("What should we do next?", [report, manual], 3000);
    expect(context).toContain("Roadmap.pdf");
    expect(context).toContain("kimi-manual-answer.txt");
    expect(context).toContain("not separate votes");
    expect(context.length).toBeLessThan(4800);
  });
  it("refuses insufficient local context budgets", () => {
    const doc = makeDoc(["Short"]);
    expect(() => localEvidenceContext("Question", [doc], 500)).toThrow(/Shorten/);
  });
});
