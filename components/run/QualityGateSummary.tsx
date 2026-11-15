"use client";

import { useArenaStore } from "@/lib/store";
import { BriefSection } from "./BriefSection";

export default function QualityGateSummary() {
  const rounds = useArenaStore((s) => s.rounds);
  const documents = useArenaStore((s) => s.documents);
  const options = useArenaStore((s) => s.runOptions ?? s.options);
  const judge = useArenaStore((s) => s.judge);
  const completed = rounds.filter((r) => r.completed);
  const responses = completed.at(-1)?.responses ?? [];
  if (!responses.length) return null;

  const rejected = responses.filter((r) => !!r.error || r.quality?.verdict === "rejected");
  const caution = responses.filter((r) => !r.error && r.quality?.verdict === "caution");
  const accepted = responses.filter((r) => !r.error && r.quality?.verdict === "accepted");
  const notChecked = responses.filter((r) => !r.error && !r.quality);
  const sourceChars = documents.reduce((n, d) => n + d.charCount, 0);
  const partial = options.privacyMode === "local-only" && sourceChars > 6000;
  return (
    <BriefSection title="Quality & evidence gate" meta="Last completed round">
      <p className="text-sm text-fg">
        <strong>{accepted.length}</strong> passed checks · <strong>{caution.length}</strong> caution
        · <strong>{rejected.length}</strong> excluded
        {notChecked.length > 0 && (
          <>
            {" "}
            · <strong>{notChecked.length}</strong> older, not checked
          </>
        )}
      </p>
      {rejected.length > 0 && (
        <p className="mt-2 text-sm text-danger">
          Excluded answers are not counted as valid votes and are not supplied to the Chairman.
        </p>
      )}
      {caution.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-fg-muted">
          {caution.slice(0, 4).map((r) => (
            <li key={r.participantId}>{r.quality?.issues.join(" ")}</li>
          ))}
        </ul>
      )}
      {partial && (
        <p className="mt-2 text-[13px] text-warning">
          PARTIAL DOCUMENT REVIEW: local models received selected excerpts, not all{" "}
          {sourceChars.toLocaleString()} extracted source characters.
        </p>
      )}
      {judge?.decisionStatus === "pending" && (
        <p className="mt-2 text-sm font-medium text-warning">
          Chairman decision pending: {judge.decisionIssues?.join(" ")}
        </p>
      )}
      <p className="mt-2 text-[13px] text-fg-muted">
        These are format, repetition and citation-presence checks, not factual verification. A
        citation label alone does not prove a claim; confidence alignment is not a measurement of
        technical correctness.
      </p>
    </BriefSection>
  );
}
