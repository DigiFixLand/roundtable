import { describe, it, expect } from "vitest";
import { reviewDecisionEvidence } from "@/lib/decision-evidence";
import { decisionAuditToMarkdown } from "@/lib/decision-report";
import type { AttachedDocument } from "@/lib/documents";
import type { DecisionRecord, RoundResponse, SessionSnapshot } from "@/lib/types";
const source: AttachedDocument = {
  id: "abcd-efgh",
  name: "HUB_Report.pdf",
  format: "pdf",
  sizeBytes: 220,
  pages: [
    {
      page: 9,
      text: "Before deployment, a restore drill must succeed; ownership of tasks must be unique.",
    },
    {
      page: 12,
      text: "Stabilize current Go controller and observe the restart recovery before implementing changes.",
    },
  ],
  charCount: 174,
};
const record: DecisionRecord = {
  consensus: "The controller needs a tested restore and evidence from HUB_Report.pdf page 9.",
  disagreements: "The engineers disagree about B versus A+.",
  uniqueInsights: "Task ownership must be unique, page 9.",
  recommendedDecision:
    "Keep Production NO-GO. Owner: infrastructure operator. Acceptance test: restore a backup and verify restart. Rollback: stop the rollout if a test fails (HUB_Report.pdf page 12).",
  uncertainty: "We cannot verify everything from partial excerpts.",
};
const answer = (id: string, content: string): RoundResponse => ({
  participantId: id,
  roundNumber: 3,
  content,
  confidence: 75,
  timestamp: 0,
});
describe("Decision Audit deterministic evidence screen", () => {
  it("does not falsely certify a page existing as verified factual support", () => {
    const r = reviewDecisionEvidence(record, [source], "Review the HUB", [
      answer("qwen", "Recommend option A."),
      answer("gemma", "Recommend option A."),
    ]);
    expect(r.referencesFound).toBeGreaterThan(0);
    expect(r.referencesToExistingPages).toBeGreaterThan(0);
    expect(r.status).toBe("screened-needs-human-review");
    expect(r.disclaimer).toContain("not semantic proof");
  });
  it("flags fabricated engineer name, metrics, missing source page and conflicting options", () => {
    const fake = {
      ...record,
      consensus: "Upgrade to Xeon and 64GB RAM with 75% failure risk (page 45).",
      recommendedDecision: "Owner: David Chen. Complete the recovery in 5 minutes, then deploy.",
    };
    const r = reviewDecisionEvidence(fake, [source], "Review the HUB", [
      answer("qwen", "I recommend option A as a gradual extension."),
      answer("gemma", "I recommend option B as a new orchestrator."),
    ]);
    expect(r.status).toBe("blocked-needs-evidence");
    const k = r.findings.map((f) => f.kind);
    expect(k).toContain("unsupported-owner");
    expect(k).toContain("unsupported-metric");
    expect(k).toContain("missing-page");
    expect(k).toContain("option-conflict");
  });
  it("renders actionable draft markdown with unverified flags and human approval gate", () => {
    const check = reviewDecisionEvidence(record, [source], "Review the HUB", []);
    const snapshot = {
      v: 1,
      prompt: "Review the HUB",
      documents: [source],
      engine: "cvp",
      options: { decisionAudit: true },
      participants: [],
      rounds: [],
      finalScore: 50,
      finalSummary: null,
      judge: {
        decisionRecord: record,
        decisionStatus: "pending",
        decisionIssues: ["Owner not verified"],
        evidenceReview: check,
      },
      disagreements: [],
      tokenTotal: null,
      createdAt: 0,
    } as unknown as SessionSnapshot;
    const md = decisionAuditToMarkdown(snapshot);
    expect(md).toContain("HUMAN REVIEW REQUIRED");
    expect(md).toContain("Acceptance tests and rollback");
    expect(md).toContain("HUB_Report.pdf");
  });
});
