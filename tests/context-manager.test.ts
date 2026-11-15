import { describe, it, expect } from "vitest";
import { estimateLocalTokens, planLocalMessages, LOCAL_INPUT_BUDGET } from "@/lib/context-manager";

describe("MSI local context manager", () => {
  it("preserves short messages exactly and avoids unnecessary clipping", () => {
    const value = planLocalMessages("You are an engineer.", "Is this test ready?");
    expect(value.clipped).toBe(false);
    expect(value.prompt).toBe("Is this test ready?");
  });
  it("bounds Persian question, source excerpts and long earlier debate within 4096-window headroom", () => {
    const system = "Assess each other participant's evidence. ".repeat(150) + "CONFIDENCE: 70";
    const question = "گزارش اصلی باید بر اساس شرایط واقعی ارزیابی شود. ".repeat(55);
    const evidence =
      "--- SELECTED DOCUMENT EXCERPTS ---\n" +
      '[EXCERPT: "HUB_Report.pdf", page 9, chunk 1]\n' +
      "The task state must have one owner. ".repeat(160) +
      "\n[END EXCERPT]";
    const result = planLocalMessages(system, question + evidence);
    expect(result.clipped).toBe(true);
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(LOCAL_INPUT_BUDGET);
    expect(result.prompt).toContain("PARTIAL");
    expect(result.prompt).toContain("گزارش");
    expect(estimateLocalTokens(result.system + result.prompt)).toBeLessThanOrEqual(
      LOCAL_INPUT_BUDGET,
    );
  });
  it("limits very long non-document messages, including non-ASCII text", () => {
    const v = planLocalMessages("Reviewer. ".repeat(500), "گزارش".repeat(2000));
    expect(v.clipped).toBe(true);
    expect(v.estimatedInputTokens).toBeLessThanOrEqual(LOCAL_INPUT_BUDGET);
  });
});
