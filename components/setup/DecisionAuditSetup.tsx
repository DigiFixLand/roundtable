"use client";

import { useArenaStore } from "@/lib/store";
import { getPersona } from "@/lib/personas";
import { Button, Card } from "@/components/ui";

/**
 * Explicit reproducible workflow: exactly two tested local models,
 * source evidence, critical review and a non-voting Chairman.
 */
export default function DecisionAuditSetup() {
  const models = useArenaStore((s) => s.availableModels);
  const documents = useArenaStore((s) => s.documents);
  const options = useArenaStore((s) => s.options);
  const running = useArenaStore((s) => s.isRunning);
  const qwen = models.find((m) => m.id === "ollama:qwen3:4b-instruct" && m.accessClass === "local");
  const gemma = models.find((m) => m.id === "ollama:gemma3:4b" && m.accessClass === "local");
  const hasPrimary = documents.some((d) => !d.name.endsWith("-manual-answer.txt"));
  const enable = () => {
    if (!qwen || !gemma || !hasPrimary || running) return;
    const s = useArenaStore.getState();
    for (const participant of s.participants) s.removeParticipant(participant.id);
    s.addParticipant(qwen, getPersona("first-principles"));
    s.addParticipant(gemma, getPersona("pessimist"));
    const values = {
      decisionAudit: true,
      engine: "cvp" as const,
      rounds: 3,
      blindFirstRound: true,
      randomizeOrder: false,
      earlyStop: false,
      judgeEnabled: true,
      judgeModelId: gemma.id,
      extractClaimsEnabled: false,
      privacyMode: "local-only" as const,
      costMode: "free-only" as const,
      cloudApproved: false,
      paidApproved: false,
    };
    for (const [k, v] of Object.entries(values)) {
      s.setOption(k as keyof typeof values, v as never);
    }
  };
  return (
    <Card as="section" className="border-accent/40" aria-label="Decision Audit workflow">
      <h2 className="text-base font-semibold">
        Decision Audit — recommended for engineering decisions
      </h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        Evidence reviewer (Qwen) + risk challenger (Gemma), three rounds, then a source-screened
        draft Decision Record. No paid API or production changes.
      </p>
      <p className="mt-2 text-[13px] text-fg-muted">
        Attach the primary report first. Optionally paste a Claude or Kimi proposal under Manual AI
        answers as an unverified reference; original documents remain the source of truth.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={enable} disabled={running || !hasPrimary || !qwen || !gemma}>
          {options.decisionAudit
            ? "Reapply Decision Audit"
            : "Configure Decision Audit (2 local models)"}
        </Button>
        {options.decisionAudit && (
          <Button
            size="sm"
            variant="secondary"
            disabled={running}
            onClick={() => useArenaStore.getState().setOption("decisionAudit", false)}
          >
            Exit audit mode
          </Button>
        )}
      </div>
      {!hasPrimary && (
        <p className="mt-2 text-xs text-warning">Attach a primary document to unlock the audit.</p>
      )}
      {(!qwen || !gemma) && (
        <p className="mt-2 text-xs text-warning">
          Qwen Instruct and Gemma local models must be available.
        </p>
      )}
      {options.decisionAudit && (
        <p className="mt-2 text-xs font-semibold text-success">
          Audit configured: 2 distinct local models · 3 rounds · Gemma Chairman · free only. Any
          manual change to the panel may require reapplying this preset.
        </p>
      )}
    </Card>
  );
}
