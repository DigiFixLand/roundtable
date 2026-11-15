import { describe, expect, it } from "vitest";
import { estimateRun, formatEstimate } from "@/lib/estimate";
import { DEFAULT_OPTIONS } from "@/lib/store";

const participants = [
  { modelInfo: { modelId: "gemma3:4b", accessClass: "local" as const } },
  { modelInfo: { modelId: "qwen3:4b", accessClass: "local" as const } },
];

describe("free-first estimated API costs", () => {
  it("shows $0 for two local models with a local judge and claim extraction", () => {
    const est = estimateRun(
      participants,
      {
        ...DEFAULT_OPTIONS,
        judgeEnabled: true,
        judgeModelId: "ollama:gemma3:4b",
        judgeAccessClass: "local",
        extractClaimsEnabled: true,
      },
      8500,
    );
    expect(est.calls).toBe(4);
    expect(est.estCostUSD).toEqual({ low: 0, high: 0 });
    expect(est.unpricedModels).toEqual([]);
    expect(formatEstimate(est)).toContain("$0 API");
  });
  it("never labels an unknown judge as a verified free model", () => {
    const est = estimateRun(
      participants,
      {
        ...DEFAULT_OPTIONS,
        judgeEnabled: true,
        judgeModelId: "unknown:unpriced",
        extractClaimsEnabled: true,
      },
      8500,
    );
    expect(est.unpricedModels).toContain("unpriced");
    expect(formatEstimate(est)).toContain("cost n/a");
  });
});
