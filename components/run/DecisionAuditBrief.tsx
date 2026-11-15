"use client";

import { useArenaStore } from "@/lib/store";
import { BriefSection } from "./BriefSection";

export default function DecisionAuditBrief() {
  const options = useArenaStore((s) => s.runOptions ?? s.options);
  const judge = useArenaStore((s) => s.judge);
  const rounds = useArenaStore((s) => s.rounds);
  if (!options.decisionAudit) return null;
  const result = judge?.evidenceReview;
  const last = rounds.filter((r) => r.completed).at(-1);
  const valid = last?.responses.filter((r) => !r.error).length ?? 0;
  const total = last?.responses.length ?? 0;
  return (
    <BriefSection title="Decision Audit — human review required">
      <p className="text-sm font-semibold text-warning">
        NOT APPROVED FOR PRODUCTION ·{" "}
        {result?.status === "blocked-needs-evidence"
          ? "Evidence gaps detected"
          : result
            ? "Mechanical screening completed"
            : "Evidence screen not completed"}
      </p>
      <p className="mt-2 text-[13px] text-fg-muted">
        Final-round responses: {valid}/{total} usable. Only cited-page existence, selected quoted
        text, source numbers and obvious conflicting choices have been screened. This is not a proof
        of factual correctness.
      </p>
      {result && (
        <>
          <p className="mt-2 text-sm">
            {result.referencesFound} page references found; {result.referencesToExistingPages}{" "}
            distinct referenced page numbers exist in the attached primary document(s).
          </p>
          {result.findings.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-warning">
              {result.findings.slice(0, 12).map((finding, i) => (
                <li key={i}>
                  {finding.message}
                  {finding.detail ? ": " + finding.detail : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              No mechanical flags found — human verification is still mandatory.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-[13px] text-fg-muted">
        Use Export → Decision Audit Report to download the action-oriented draft, unresolved issues
        and evidence flags. No tasks are automatically created.
      </p>
    </BriefSection>
  );
}
