"use client";

// Chairman Decision Record — the primary non-voting synthesis artifact.
// The fixed five-section record is rendered first; the raw Chairman text
// remains available below it for transparency. Older snapshots are mapped
// into the closest Phase-2 sections without rewriting their stored evidence.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import { stripJudgeConfidence } from "@/lib/format";
import type { DecisionRecord, JudgeResult } from "@/lib/types";
import { cn } from "@/components/ui";
import Markdown from "./Markdown";
import { BriefSection } from "./run/BriefSection";

const SECTIONS: Array<{
  key: keyof DecisionRecord;
  title: string;
  stripe: string;
}> = [
  { key: "consensus", title: "Consensus", stripe: "border-success" },
  { key: "disagreements", title: "Disagreements", stripe: "border-warning" },
  { key: "uniqueInsights", title: "Unique Insights", stripe: "border-info" },
  {
    key: "recommendedDecision",
    title: "Recommended Answer / Decision",
    stripe: "border-accent",
  },
  { key: "uncertainty", title: "Uncertainty", stripe: "border-fg-muted" },
];

function recordForJudge(judge: JudgeResult): DecisionRecord {
  if (judge.decisionRecord) return judge.decisionRecord;
  return {
    consensus: judge.majorityPosition ?? "",
    disagreements: judge.minorityPositions ?? "",
    uniqueInsights: "",
    recommendedDecision: judge.majorityPosition ?? "",
    uncertainty: judge.unresolvedDisputes ?? "",
  };
}

export default function JudgeCard() {
  const judge = useArenaStore((s) => s.judge);
  const stream = useArenaStore((s) => s.judgeStream);
  const running = useArenaStore((s) => s.judgeRunning);
  const [showFull, setShowFull] = useState(false);

  if (!judge && !running) return null;

  const meta = judge
    ? `${judge.providerName} · ${judge.modelId} · non-voting Chairman`
    : "Non-voting Chairman";
  const record = judge ? recordForJudge(judge) : null;
  const structured =
    !running && !!record && SECTIONS.some((section) => record[section.key].trim().length > 0);
  const fullText = stripJudgeConfidence(running ? stream : (judge?.content ?? ""));

  return (
    <BriefSection
      title="Decision Record"
      meta={meta}
      aside={
        running ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Writing…
          </span>
        ) : undefined
      }
    >
      {structured && record ? (
        <>
          <div className="space-y-4">
            {SECTIONS.map(({ key, title, stripe }) => {
              const text = stripJudgeConfidence(record[key]);
              return (
                <div key={key} className={cn("border-l-2 pl-3", stripe)}>
                  <h3 className="text-[13px] font-semibold text-fg-muted">{title}</h3>
                  {text ? (
                    <div className="prose-rt mt-1">
                      <Markdown>{text}</Markdown>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-fg-muted">None noted.</p>
                  )}
                </div>
              );
            })}
          </div>
          {fullText && (
            <div>
              <button
                type="button"
                aria-expanded={showFull}
                onClick={() => setShowFull((value) => !value)}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                {showFull ? "Hide full Chairman synthesis" : "Show full Chairman synthesis"}
              </button>
              {showFull && (
                <div className="prose-rt mt-2 border-t border-border pt-3">
                  <Markdown>{fullText}</Markdown>
                </div>
              )}
            </div>
          )}
        </>
      ) : running ? (
        <div
          aria-busy="true"
          className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg"
        >
          {fullText || "…"}
        </div>
      ) : (
        <div className="prose-rt">
          <Markdown>{fullText || "…"}</Markdown>
        </div>
      )}
    </BriefSection>
  );
}
