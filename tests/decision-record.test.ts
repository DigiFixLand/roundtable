import { describe, expect, it } from "vitest";
import { parseDecisionRecord } from "@/lib/consensus-engine";
import { JUDGE_PERSONA } from "@/lib/personas";
import { snapshotToMarkdown } from "@/lib/session";
import { FIXTURE_SNAPSHOT } from "./fixtures/snapshot";

const RECORD_TEXT = `## Consensus
The core approach is viable with a staged rollout.

## Disagreements
The panel remains split on whether to launch this week or after another test.

## Unique Insights
One participant identified a reversible pilot as a way to reduce downside.

## Recommended Answer / Decision
Run the reversible pilot first, then decide on full launch from the measured result.

## Uncertainty
The expected conversion lift is unverified and model confidence is not objective correctness.`;

describe("Decision Record", () => {
  it("parses the fixed five-section Chairman schema", () => {
    expect(parseDecisionRecord(RECORD_TEXT)).toEqual({
      consensus: "The core approach is viable with a staged rollout.",
      disagreements: "The panel remains split on whether to launch this week or after another test.",
      uniqueInsights: "One participant identified a reversible pilot as a way to reduce downside.",
      recommendedDecision:
        "Run the reversible pilot first, then decide on full launch from the measured result.",
      uncertainty:
        "The expected conversion lift is unverified and model confidence is not objective correctness.",
    });
  });

  it("maps legacy majority/minority judge output without erasing dissent", () => {
    const legacy = `## Majority Position
Ship the pilot.

## Minority Positions
Wait for another benchmark.

## Unresolved Disputes
The conversion estimate is unverified.`;
    expect(parseDecisionRecord(legacy)).toEqual({
      consensus: "Ship the pilot.",
      disagreements: "Wait for another benchmark.\n\nThe conversion estimate is unverified.",
      uniqueInsights: "",
      recommendedDecision: "Ship the pilot.",
      uncertainty: "The conversion estimate is unverified.",
    });
  });

  it("exports all five Decision Record sections to Markdown", () => {
    const decisionRecord = parseDecisionRecord(RECORD_TEXT);
    const md = snapshotToMarkdown({
      ...FIXTURE_SNAPSHOT,
      judge: {
        ...FIXTURE_SNAPSHOT.judge!,
        content: RECORD_TEXT,
        decisionRecord,
      },
    });
    expect(md).toContain("## Decision Record");
    for (const heading of [
      "### Consensus",
      "### Disagreements",
      "### Unique Insights",
      "### Recommended Answer / Decision",
      "### Uncertainty",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain(decisionRecord.recommendedDecision);
  });

  it("instructs the Chairman to use exactly the five canonical headings", () => {
    const prompt = JUDGE_PERSONA.systemPrompt;
    const headings = [
      "## Consensus",
      "## Disagreements",
      "## Unique Insights",
      "## Recommended Answer / Decision",
      "## Uncertainty",
    ];
    let previous = -1;
    for (const heading of headings) {
      const index = prompt.indexOf(heading);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(prompt).not.toContain("## Majority Position");
    expect(prompt).toContain("model-reported confidence");
  });
});
