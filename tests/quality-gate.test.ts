import { describe, expect, it } from "vitest";
import { assessResponseQuality, boundedDebateContext, compactStatement } from "@/lib/quality-gate";

describe("quality gate", () => {
  it("rejects missing final answers and reasoning-only output", () => {
    expect(assessResponseQuality("").verdict).toBe("rejected");
    expect(assessResponseQuality("<think>Long hidden internal deliberation</think>").verdict).toBe(
      "rejected",
    );
  });
  it("rejects repetitive loops that previously passed as votes", () => {
    const repeated =
      "Cloud Agent Server Gateway and Task Orchestrator without specific decisions. ".repeat(18);
    const result = assessResponseQuality(repeated + "\nCONFIDENCE: 90");
    expect(result.verdict).toBe("rejected");
    expect(result.issues.join(" ")).toMatch(/loop/);
  });
  it("keeps brief answers visible but cautions instead of inventing facts", () => {
    const r = assessResponseQuality("Check restore before deployment.\nCONFIDENCE: 80");
    expect(r.verdict).toBe("caution");
    expect(r.issues.join(" ")).toMatch(/too brief/i);
  });
  it("does not confuse page-citation presence with verified truth", () => {
    const text =
      "The production process requires tested backup restore, recorded access checks, an observable acceptance test, and a rollback gate, cited from HUB_Report.pdf page 9.\nCONFIDENCE: 75";
    const r = assessResponseQuality(text, "--- SELECTED DOCUMENT EXCERPTS ---");
    expect(r.verdict).toBe("accepted");
    const missing = assessResponseQuality(
      text.replace("page 9", "the source"),
      "--- SELECTED DOCUMENT EXCERPTS ---",
    );
    expect(missing.verdict).toBe("caution");
    expect(missing.issues.join(" ")).toMatch(/citation/);
  });
  it("flags invented hardware metrics and citations to unseen pages without claiming semantic proof", () => {
    const question =
      '--- SELECTED DOCUMENT EXCERPTS ---\\n[EXCERPT: "HUB_Report.pdf", page 9, chunk 1]\\nRestore test pending.\\n[END EXCERPT]';
    const response =
      "Upgrade the infrastructure to Xeon with 64GB RAM and assume 75% failure likelihood (HUB_Report.pdf, page 12).\\nCONFIDENCE: 95";
    const r = assessResponseQuality(response, question);
    expect(r.verdict).toBe("caution");
    expect(r.issues.join(" ")).toMatch(/supplied excerpts|outside/);
    expect(r.issues.join(" ")).toMatch(/hardware|percentages/);
  });
  it("bounds prior-round context and excludes rejected answers", () => {
    const rs = [
      {
        roundNumber: 1,
        participantId: "old",
        confidence: 66,
        content: "Old substantial claim. ".repeat(180),
      },
      {
        roundNumber: 2,
        participantId: "latest",
        confidence: 80,
        content: "Important recent objection. ".repeat(180),
      },
      {
        roundNumber: 2,
        participantId: "bad",
        confidence: 0,
        content: "garbage".repeat(200),
        error: "Quality Gate: repeated loop",
      },
    ];
    const text = boundedDebateContext(rs, 1200);
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toContain("latest");
    expect(text).not.toContain("Participant bad");
    expect(compactStatement("ABC".repeat(500), 200)).toContain("TRUNCATED");
  });
});
