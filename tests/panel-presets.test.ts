import { describe, it, expect } from "vitest";
import { PANEL_PRESETS, applyPreset, getPreset, type PanelPreset } from "@/lib/panel-presets";
import { PERSONAS } from "@/lib/personas";
import type { ModelInfo } from "@/lib/types";

const m = (providerId: string, modelId: string, preferred?: boolean): ModelInfo => ({
  id: `${providerId}:${modelId}`,
  providerId,
  providerName: providerId.toUpperCase(),
  modelId,
  ...(preferred !== undefined ? { preferred } : {}),
});

const balanced = getPreset("balanced")!;

describe("PANEL_PRESETS", () => {
  it("defines economic and classic presets with valid persona ids", () => {
    expect(PANEL_PRESETS.map((p) => p.id)).toEqual([
      "economy",
      "local-diversity",
      "balanced",
      "red-team",
      "investor",
    ]);
    const ids = new Set(PERSONAS.map((p) => p.id));
    for (const preset of PANEL_PRESETS) {
      expect(preset.personaIds).toHaveLength(
        preset.id === "economy" ? 2 : preset.id === "local-diversity" ? 5 : 3,
      );
      for (const id of preset.personaIds) expect(ids.has(id)).toBe(true);
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
    }
  });

  it("getPreset finds by id and returns undefined otherwise", () => {
    expect(getPreset("red-team")?.name).toBe("Red team");
    expect(getPreset("nope")).toBeUndefined();
  });
});

describe("applyPreset", () => {
  it("spreads five distinct local models across grouped model-family providers", () => {
    const models = [
      m("ollama", "qwen3:4b-instruct"),
      m("ollama", "gemma3:4b"),
      m("deepseek-local", "deepseek-r1:7b"),
      m("phi-local", "phi4-mini:3.8b"),
      m("llama-local", "llama3.2:3b"),
    ];
    const seats = applyPreset(getPreset("local-diversity")!, models);
    expect(seats).toHaveLength(5);
    expect(new Set(seats.map((s) => s.model.id)).size).toBe(5);
    expect(seats.some((s) => s.model.modelId === "deepseek-r1:7b")).toBe(true);
  });

  it("returns [] when no models are available", () => {
    expect(applyPreset(balanced, [])).toEqual([]);
  });

  it("uses a single model for every seat when that is all there is", () => {
    const only = m("a", "one");
    const seats = applyPreset(balanced, [only]);
    expect(seats).toHaveLength(3);
    expect(seats.every((s) => s.model === only)).toBe(true);
    expect(seats.map((s) => s.persona.id)).toEqual(balanced.personaIds);
  });

  it("rotates through a single provider's models", () => {
    const models = [m("a", "one"), m("a", "two")];
    const seats = applyPreset(balanced, models);
    expect(seats.map((s) => s.model.modelId)).toEqual(["one", "two", "one"]);
  });

  it("spreads seats across providers round-robin", () => {
    const models = [m("a", "a1"), m("a", "a2"), m("b", "b1"), m("c", "c1")];
    const seats = applyPreset(balanced, models);
    expect(seats.map((s) => s.model.providerId)).toEqual(["a", "b", "c"]);
  });

  it("cycles providers when there are more seats than providers", () => {
    const models = [m("a", "a1"), m("a", "a2"), m("b", "b1")];
    const seats = applyPreset(balanced, models);
    expect(seats.map((s) => s.model.id)).toEqual(["a:a1", "b:b1", "a:a2"]);
  });

  it("prefers preferred models and providers that have them", () => {
    const models = [
      m("a", "a-fetched-1"),
      m("a", "a-fetched-2"),
      m("b", "b-other"),
      m("b", "b-pref", true),
    ];
    const seats = applyPreset(balanced, models);
    // Provider b has a preferred model so it goes first, and only its preferred model is used.
    expect(seats.map((s) => s.model.id)).toEqual(["b:b-pref", "a:a-fetched-1", "b:b-pref"]);
  });

  it("is deterministic", () => {
    const models = [m("x", "x1"), m("y", "y1", true), m("z", "z1")];
    expect(applyPreset(balanced, models)).toEqual(applyPreset(balanced, models));
  });

  it("skips unknown persona ids", () => {
    const preset: PanelPreset = {
      id: "balanced",
      name: "Test",
      description: "",
      personaIds: ["pessimist", "does-not-exist", "domain-expert"],
    };
    const seats = applyPreset(preset, [m("a", "a1"), m("b", "b1")]);
    expect(seats.map((s) => s.persona.id)).toEqual(["pessimist", "domain-expert"]);
    expect(seats.map((s) => s.model.providerId)).toEqual(["a", "b"]);
  });
});
