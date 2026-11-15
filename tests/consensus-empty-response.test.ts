import { describe, it, expect, vi } from "vitest";
import { PERSONAS } from "@/lib/personas";
import { DEFAULT_OPTIONS } from "@/lib/store";
import type { ConsensusEvent, Participant } from "@/lib/types";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ chat: (modelId: string) => ({ modelId }) }),
}));
vi.mock("@/lib/providers", () => ({
  findResolvedModel: () => ({
    providerId: "ollama",
    providerName: "Ollama",
    modelId: "qwen3:4b",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
    accessClass: "local",
  }),
}));
vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      /* Simulates thinking-only output */
    })(),
    usage: Promise.resolve({ inputTokens: 200, outputTokens: 1500 }),
  })),
}));

const { runConsensus } = await import("@/lib/consensus-engine");

describe("thinking-only output does not count as a successful answer", () => {
  it("emits a visible error instead of empty successful responses", async () => {
    const participant: Participant = {
      id: "think-only",
      modelInfo: {
        id: "ollama:qwen3:4b",
        providerId: "ollama",
        providerName: "Ollama",
        modelId: "qwen3:4b",
      },
      persona: PERSONAS[0],
    };
    const events: ConsensusEvent[] = [];
    await runConsensus(
      "Describe a safe deployment gate.",
      [participant],
      {
        ...DEFAULT_OPTIONS,
        engine: "blind-jury",
        judgeEnabled: false,
        extractClaimsEnabled: false,
      },
      (event) => events.push(event),
    );
    const end = events.find((e) => e.type === "participant-end");
    expect(end?.type).toBe("participant-end");
    if (end?.type !== "participant-end") throw new Error("Missing participant-end");
    expect(end.error).toMatch(/no final answer/);
    expect(end.confidence).toBe(0);
    expect(end.fullContent).toContain("[Error from Ollama");
    expect(events.some((e) => e.type === "consensus-complete")).toBe(true);
  });
});
