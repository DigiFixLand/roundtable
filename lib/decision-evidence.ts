import type { AttachedDocument } from "./documents";
import type { DecisionRecord, RoundResponse } from "./types";

/**
 * Deterministic first-pass source screening. Neither a valid page number
 * nor a matching phrase proves that a technical conclusion is true.
 */
export interface EvidenceFinding {
  kind:
    | "missing-citation"
    | "missing-page"
    | "unsupported-metric"
    | "unsupported-owner"
    | "unsupported-quote"
    | "option-conflict";
  level: "warning" | "critical";
  message: string;
  detail?: string;
}
export interface DecisionEvidenceAudit {
  status: "screened-needs-human-review" | "blocked-needs-evidence";
  sourceCount: number;
  pageCount: number;
  referencesFound: number;
  referencesToExistingPages: number;
  findings: EvidenceFinding[];
  disclaimer: string;
}

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[\u064b-\u065f]/g, "")
    .replace(/[\s\u200c\u200f\u200e\p{P}]+/gu, " ")
    .trim();
}
function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function selectedOption(content: string): string | null {
  const choices = [
    ...content.matchAll(
      /(?:recommend(?:ation|ed)?|choose|select|prefer|پیشنهاد|انتخاب|ترجیح)[^.!?\n]{0,90}?(?:option|گزینه|معماری)?\s*([ABC])\b/giu,
    ),
  ].map((m) => m[1].toUpperCase());
  return choices.length ? (choices.at(-1) ?? null) : null;
}

export function reviewDecisionEvidence(
  record: DecisionRecord,
  documents: readonly AttachedDocument[],
  originalQuestion: string,
  finalResponses: readonly RoundResponse[],
): DecisionEvidenceAudit {
  const findings: EvidenceFinding[] = [];
  const primary = documents.filter((d) => !d.name.endsWith("-manual-answer.txt"));
  const pages = primary.flatMap((d) =>
    d.pages.map((p) => ({ name: d.name, page: p.page, text: p.text })),
  );
  const allPrimary = normalise(
    primary.map((d) => d.pages.map((p) => p.text).join("\n")).join("\n") + "\n" + originalQuestion,
  );
  const narrative = [
    record.consensus,
    record.disagreements,
    record.uniqueInsights,
    record.recommendedDecision,
    record.uncertainty,
  ].join("\n");
  const factual = record.recommendedDecision + "\n" + record.consensus;
  // A source page must be named or uniquely attributable to one source.
  const refs = [...narrative.matchAll(/(?:page|صفحه|p\.)\s*(\d{1,3})/giu)].map((match) =>
    Number(match[1]),
  );
  let validRefs = 0;
  for (const page of [...new Set(refs)]) {
    if (pages.some((p) => p.page === page)) validRefs++;
    else
      findings.push({
        kind: "missing-page",
        level: "critical",
        message: `Cited page ${page} is absent from attached primary documents.`,
      });
  }
  if (!refs.length)
    findings.push({
      kind: "missing-citation",
      level: "critical",
      message:
        "Chairman supplied no page citations to the primary document; claims remain unverified.",
    });

  // Treat new numbers as unverified: they may be *proposed thresholds*, not
  // factual statements. The report must distinguish that explicitly.
  const metricMatches = [
    ...factual.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:%|GB|TB|minutes?|mins?|hours?|دقیقه|ساعت)\b/giu),
  ].map((m) => compact(m[0]));
  for (const figure of [...new Set(metricMatches)]) {
    if (!allPrimary.includes(normalise(figure))) {
      findings.push({
        kind: "unsupported-metric",
        level: "critical",
        message: "Numerical/hardware metric not found in source or original question.",
        detail: figure,
      });
    }
  }
  if (/\bXeon\b/i.test(factual) && !allPrimary.includes("xeon")) {
    findings.push({
      kind: "unsupported-metric",
      level: "critical",
      message: "Xeon hardware recommendation is not grounded in the supplied source.",
    });
  }

  // Only obvious two-token person names after Owner: are checked.
  const owners = [
    ...factual.matchAll(/(?:owner|responsible person)\s*:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi),
  ].map((m) => m[1]);
  for (const owner of [...new Set(owners)]) {
    if (/\b(?:manager|engineer|operator|lead|team|administrator|officer)\b/i.test(owner)) continue;
    if (!allPrimary.includes(normalise(owner)))
      findings.push({
        kind: "unsupported-owner",
        level: "critical",
        message: "Named owner is absent from the primary source and question.",
        detail: owner,
      });
  }
  // Quote check: flag only sufficiently long, verbatim quoted assertions in
  // recommendations. Short phrases may be labels rather than source quotes.
  const quotes = [...factual.matchAll(/["“«]([^"”»]{24,220})["”»]/gu)].map((m) => m[1]);
  for (const quote of [...new Set(quotes)]) {
    if (!allPrimary.includes(normalise(quote)))
      findings.push({
        kind: "unsupported-quote",
        level: "warning",
        message: "Quoted passage does not occur verbatim in the provided primary text.",
        detail: quote.slice(0, 130),
      });
  }

  const stances = new Set(
    finalResponses
      .filter((r) => !r.error)
      .map((r) => selectedOption(r.content))
      .filter((s): s is string => !!s),
  );
  if (stances.size > 1)
    findings.push({
      kind: "option-conflict",
      level: "critical",
      message:
        "Valid panel members express different architecture choices; the Chairman must not state unanimous agreement.",
      detail: [...stances].sort().join(" vs "),
    });

  return {
    status: findings.some((f) => f.level === "critical")
      ? "blocked-needs-evidence"
      : "screened-needs-human-review",
    sourceCount: primary.length,
    pageCount: pages.length,
    referencesFound: refs.length,
    referencesToExistingPages: validRefs,
    findings,
    disclaimer:
      "Mechanical source screen only. Matching a page or phrase is not semantic proof. No production change or task execution is authorized.",
  };
}
