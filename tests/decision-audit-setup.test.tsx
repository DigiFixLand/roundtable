// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useArenaStore, DEFAULT_OPTIONS } from "@/lib/store";
import DecisionAuditSetup from "@/components/setup/DecisionAuditSetup";
const models = [
  {
    id: "ollama:qwen3:4b-instruct",
    providerId: "ollama",
    providerName: "MSI",
    modelId: "qwen3:4b-instruct",
    accessClass: "local" as const,
  },
  {
    id: "ollama:gemma3:4b",
    providerId: "ollama",
    providerName: "MSI",
    modelId: "gemma3:4b",
    accessClass: "local" as const,
  },
  {
    id: "openai:gpt-4.1-mini",
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-4.1-mini",
    accessClass: "paid-cloud" as const,
  },
];
beforeEach(() =>
  useArenaStore.setState({
    availableModels: models,
    participants: [],
    documents: [],
    options: { ...DEFAULT_OPTIONS },
    isRunning: false,
  }),
);
describe("Decision Audit setup", () => {
  it("requires a primary document before activation", () => {
    render(<DecisionAuditSetup />);
    expect(screen.getByRole("button", { name: /Configure Decision Audit/ })).toBeDisabled();
  });
  it("selects exactly Qwen+Gemma and closes the paid routing path", () => {
    useArenaStore.setState({
      documents: [
        {
          id: "doc",
          name: "HUB_Report.pdf",
          format: "pdf",
          sizeBytes: 50,
          charCount: 20,
          pages: [{ page: 1, text: "A private system report." }],
        },
      ],
    });
    render(<DecisionAuditSetup />);
    fireEvent.click(screen.getByRole("button", { name: /Configure Decision Audit/ }));
    const s = useArenaStore.getState();
    expect(s.participants.map((p) => p.modelInfo.id)).toEqual([
      "ollama:qwen3:4b-instruct",
      "ollama:gemma3:4b",
    ]);
    expect(s.options).toMatchObject({
      decisionAudit: true,
      engine: "cvp",
      rounds: 3,
      judgeEnabled: true,
      judgeModelId: "ollama:gemma3:4b",
      extractClaimsEnabled: false,
      privacyMode: "local-only",
      costMode: "free-only",
      earlyStop: false,
    });
    expect(s.participants.some((p) => p.modelInfo.providerId === "openai")).toBe(false);
  });
});
