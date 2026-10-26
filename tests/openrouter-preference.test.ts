import { describe, expect, it } from "vitest";
import { suggestJudgeModel } from "@/components/setup/ProtocolPicker";
import { applyPreset, getPreset } from "@/lib/panel-presets";
import type { ModelInfo } from "@/lib/types";

const model = (
  providerId: string,
  modelId: string,
  preferred = false,
): ModelInfo => ({
  id: `${providerId}:${modelId}`,
  providerId,
  providerName: providerId === "openrouter" ? "OpenRouter" : providerId,
  modelId,
  ...(preferred ? { preferred: true } : {}),
});

describe("OpenRouter primary path", () => {
  it("chooses the tested OpenRouter Chairman model before direct providers", () => {
    const models = [
      model("openai", "gpt-4.1-mini", true),
      model("openrouter", "random/model"),
      model("openrouter", "google/gemini-2.5-flash-lite", true),
    ];
    expect(suggestJudgeModel(models, [])?.id).toBe(
      "openrouter:google/gemini-2.5-flash-lite",
    );
  });

  it("keeps the Chairman on OpenRouter when the first tested model is already seated", () => {
    const first = model("openrouter", "google/gemini-2.5-flash-lite", true);
    const second = model("openrouter", "openai/gpt-4.1-mini", true);
    const direct = model("openai", "gpt-4.1-mini", true);
    expect(suggestJudgeModel([direct, first, second], [{ modelInfo: first }])?.id).toBe(second.id);
  });

  it("starts panel preset provider rotation with OpenRouter", () => {
    const preset = getPreset("balanced")!;
    const seats = applyPreset(preset, [
      model("openai", "gpt-4.1-mini", true),
      model("openrouter", "google/gemini-2.5-flash-lite", true),
      model("anthropic", "claude-sonnet", true),
    ]);
    expect(seats[0].model.providerId).toBe("openrouter");
    expect(new Set(seats.map((s) => s.model.providerId)).size).toBe(3);
  });
});
