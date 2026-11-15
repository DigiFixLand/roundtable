import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsensusEvent, Participant } from "@/lib/types";
import { PERSONAS } from "@/lib/personas";
import { DEFAULT_OPTIONS } from "@/lib/store";

const outputs: string[] = [];
const prompts: Array<{ system?: string; prompt?: string }> = [];
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ chat: (modelId: string) => ({ modelId }) }),
}));
vi.mock("@/lib/providers", () => ({
  findResolvedModel: () => ({
    providerId: "ollama",
    providerName: "Ollama",
    modelId: "gemma3:4b",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
    accessClass: "local",
  }),
}));
vi.mock("ai", () => ({
  streamText: vi.fn((request: { system?: string; prompt?: string }) => {
    prompts.push({ system: request.system, prompt: request.prompt });
    const content =
      outputs.shift() ??
      "The proposed next step is a tested backup restore with an owner and explicit stop condition.\nCONFIDENCE: 71";
    return {
      textStream: (async function* () {
        yield content;
      })(),
      usage: Promise.resolve({ inputTokens: 110, outputTokens: 150 }),
    };
  }),
}));
const { runConsensus } = await import("@/lib/consensus-engine");
const p = (id: string, personaIndex: number): Participant => ({
  id,
  persona: PERSONAS[personaIndex],
  modelInfo: { id: "ollama:" + id, providerId: "ollama", providerName: "Ollama", modelId: id },
});
const options = {
  ...DEFAULT_OPTIONS,
  engine: "blind-jury" as const,
  rounds: 1,
  judgeEnabled: true,
  judgeModelId: "ollama:gemma3:4b",
  extractClaimsEnabled: false,
};
const good =
  "The HUB project must verify a restore drill, least-privilege permissions and an observable test before production. A rollback is required if startup fails.\nCONFIDENCE: 82";
const structured = [
  "## Consensus",
  "A backup restoration test is necessary before production.",
  "## Disagreements",
  "One model favors extending the Go controller; another favors redesign.",
  "## Unique Insights",
  "A stop condition should depend on post-restart reachability.",
  "## Recommended Answer / Decision",
  "Defer production. Owner: infrastructure operator. Acceptance test: restore a fresh backup, reboot and verify remote access. Rollback: revert the last change if the test fails.",
  "## Uncertainty",
  "Source claims and hardware specifications are unverified until inspected.",
].join("\n\n");

beforeEach(() => {
  outputs.length = 0;
  prompts.length = 0;
});
describe("Quality Gate and Chairman decision integration", () => {
  it("rejects looped model output before scoring and synthesizing; blocks unstructured judge", async () => {
    outputs.push(
      "Cloud Agent Cloud Agent Server Cloud Agent Gateway and Orchestrator details. ".repeat(22) +
        "\nCONFIDENCE: 99",
      good,
      "Both appear in favor.",
    );
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Review the HUB implementation with evidence.",
      [p("qwen", 0), p("gemma", 1)],
      options,
      (e) => events.push(e),
    );
    const answers = events.filter((e) => e.type === "participant-end");
    expect(answers).toHaveLength(2);
    if (answers[0].type !== "participant-end" || answers[1].type !== "participant-end")
      throw Error("Bad events");
    expect(answers[0].error).toMatch(/Quality Gate/);
    expect(answers[0].quality?.verdict).toBe("rejected");
    expect(answers[1].error).toBeUndefined();
    const round = events.find((e) => e.type === "round-end");
    if (round?.type !== "round-end") throw Error("No round score");
    expect(round.consensusScore).toBe(82);
    expect(prompts.at(-1)?.prompt).not.toContain("Cloud Agent Server");
    const judge = events.find((e) => e.type === "judge-end");
    if (judge?.type !== "judge-end") throw Error("No judge");
    expect(judge.result.decisionStatus).toBe("pending");
    expect(judge.result.decisionRecord?.recommendedDecision).toContain("DECISION PENDING");
    expect(judge.result.decisionIssues).toContain("Fewer than two valid independent answers.");
  });
  it("accepts a properly structured, actionable record without treating confidence as evidence", async () => {
    outputs.push(good, good.replace("82", "75"), structured);
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Review the HUB implementation.",
      [p("qwen", 0), p("gemma", 1)],
      options,
      (e) => events.push(e),
    );
    const judge = events.find((e) => e.type === "judge-end");
    if (judge?.type !== "judge-end") throw Error("No judge");
    expect(judge.result.decisionStatus).toBe("structured");
    expect(judge.result.decisionRecord?.recommendedDecision).toContain("Owner");
    expect(judge.result.decisionIssues).toEqual([]);
  });
  it("reports malformed contradiction extraction as unknown, never as verified agreement", async () => {
    outputs.push(good, good, "No contradictions detected.");
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Review the HUB implementation.",
      [p("qwen", 0), p("gemma", 1)],
      { ...options, judgeEnabled: false, extractClaimsEnabled: true },
      (event) => events.push(event),
    );
    const claims = events.find((event) => event.type === "claims-end");
    if (claims?.type !== "claims-end") throw Error("No claims digest");
    expect(claims.digest.error).toMatch(/no valid structured JSON/i);
    expect(claims.digest.contradictions).toHaveLength(0);
  });

  it("runs three real CVP phases with compact prior context and distinct final synthesis", async () => {
    const longGood =
      Array.from(
        { length: 28 },
        (_, i) =>
          `Engineering checkpoint ${i}: test backup set ${i}, validate permission ${i}, record trace ${i} and rollback condition ${i}.\n`,
      ).join("") + "\nCONFIDENCE: 75";
    for (let i = 0; i < 6; i++) outputs.push(longGood);
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Determine next safe HUB implementation step.",
      [p("qwen", 0), p("gemma", 1)],
      {
        ...options,
        engine: "cvp",
        rounds: 3,
        judgeEnabled: false,
        blindFirstRound: true,
        earlyStop: false,
        randomizeOrder: false,
      },
      (e) => events.push(e),
    );
    const starts = events.filter((e) => e.type === "round-start");
    expect(starts).toHaveLength(3);
    expect(starts.map((e) => (e.type === "round-start" ? e.roundType : null))).toEqual([
      "initial-analysis",
      "counterarguments",
      "synthesis",
    ]);
    expect(events.filter((e) => e.type === "participant-end")).toHaveLength(6);
    expect(prompts[2].system).toContain("BOUNDED EXCERPTS");
    expect(prompts[2].system?.length).toBeLessThan(4300);
  });
});
