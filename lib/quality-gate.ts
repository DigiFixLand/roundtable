/**
 * Deterministic first-line output quality checks. This is a guardrail,
 * NOT a factual-verification or hallucination detector.
 */
export type QualityVerdict = "accepted" | "caution" | "rejected";
export interface QualityAssessment {
  verdict: QualityVerdict;
  issues: string[];
}

const REASONING = /<think>[\s\S]*?<\/think>/gi;
const CONFIDENCE = /(?:^|\n)\s*CONFIDENCE:\s*\d{1,3}\s*$/i;

/** Compact a prior statement without silently implying its complete text was reviewed. */
export function compactStatement(content: string, maxChars = 720): string {
  const clean = content.replace(CONFIDENCE, "").trim();
  if (clean.length <= maxChars) return clean;
  const head = Math.floor(maxChars * 0.62);
  const tail = maxChars - head;
  return (
    clean.slice(0, head) + "\n[TRUNCATED — read full transcript for context]\n" + clean.slice(-tail)
  );
}

export function boundedDebateContext(
  responses: readonly {
    roundNumber: number;
    participantId: string;
    content: string;
    confidence: number;
    error?: string;
  }[],
  maxChars = 3200,
): string {
  // Prioritize the most recent valid round, retaining some earlier history.
  const valid = responses.filter((r) => !r.error).sort((a, b) => b.roundNumber - a.roundNumber);
  const out: string[] = [];
  let used = 0;
  for (const r of valid) {
    if (used >= maxChars) break;
    const entry =
      `[R${r.roundNumber} Participant ${r.participantId} | Self-reported confidence ${r.confidence}%]\n` +
      compactStatement(r.content, Math.min(520, maxChars - used - 80));
    if (entry.length > maxChars - used) break;
    out.push(entry);
    used += entry.length + 12;
  }
  return out.join("\n\n---\n\n");
}

function hasRepetitiveLoop(text: string): boolean {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 1);
  if (words.length < 75) return false;
  const six = 6;
  const seen = new Set<string>();
  let repeated = 0;
  let total = 0;
  for (let i = 0; i <= words.length - six; i++) {
    const group = words.slice(i, i + six).join(" ");
    if (seen.has(group)) repeated++;
    else seen.add(group);
    total++;
  }
  if (total >= 65 && repeated / total > 0.48) return true;
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length >= 30);
  if (lines.length < 6) return false;
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  return (
    Math.max(...counts.values()) >= 4 &&
    [...counts].reduce((a, [line, n]) => a + (n > 1 ? line.length * n : 0), 0) > text.length * 0.45
  );
}

function hasDocumentEvidence(prompt: string): boolean {
  return (
    prompt.includes("--- SELECTED DOCUMENT EXCERPTS") ||
    prompt.includes("--- DOCUMENT") ||
    prompt.includes("[EXCERPT:")
  );
}

export function assessResponseQuality(content: string, userPrompt = ""): QualityAssessment {
  const issues: string[] = [];
  const visible = content.replace(REASONING, "").replace(CONFIDENCE, "").trim();
  if (!visible || visible.length < 8) {
    return { verdict: "rejected", issues: ["No substantive final answer was produced."] };
  }
  if (hasRepetitiveLoop(visible)) {
    return {
      verdict: "rejected",
      issues: ["Repeated text loop detected; excluded from votes and Chairman synthesis."],
    };
  }
  // Advisory checks: incomplete citations or terse answers are not proof of falsehood.
  if (visible.length < 110)
    issues.push("Answer is too brief for a substantial engineering review.");
  if (
    hasDocumentEvidence(userPrompt) &&
    !/(?:page|section|صفحه|بخش)\s*(?:#?\d+|[۰-۹]+)/iu.test(visible)
  ) {
    issues.push("No page/section citation found; factual assertions are unverified.");
  }
  // A citation may point to a page the local model never received.
  // Mark it as unverified rather than pretending a semantic citation check.
  const citedPages = [...visible.matchAll(/(?:page|صفحه|p\\.)\\s*(\\d{1,3})/giu)].map((match) =>
    Number(match[1]),
  );
  const visiblePages = new Set(
    [...userPrompt.matchAll(/\\[EXCERPT:\\s*"[^"]+",\\s*page\\s+(\\d+)/giu)].map((match) =>
      Number(match[1]),
    ),
  );
  if (visiblePages.size && citedPages.some((page) => !visiblePages.has(page))) {
    issues.push("Page citation points outside the supplied excerpts; evidence unverified.");
  }
  if (userPrompt.includes("--- SELECTED DOCUMENT EXCERPTS")) {
    const sourceOnly = userPrompt
      .slice(userPrompt.indexOf("--- SELECTED DOCUMENT EXCERPTS"))
      .toLowerCase();
    const technicalFigures = [
      ...visible.matchAll(/(?:\\d+(?:\\.\\d+)?\\s*(?:%|GB|TB)|Xeon)/giu),
    ].map((match) => match[0].toLowerCase().replace(/\\s+/g, ""));
    if (technicalFigures.some((figure) => !sourceOnly.replace(/\\s+/g, "").includes(figure))) {
      issues.push(
        "One or more percentages or hardware specifications are not supported by the supplied excerpts.",
      );
    }
  }
  if (!CONFIDENCE.test(content))
    issues.push("No explicit trailing confidence number was provided.");
  return { verdict: issues.length ? "caution" : "accepted", issues };
}

/** A quote/citation label is not proof that the cited page supports the claim. */
export const EVIDENCE_NOTE =
  "Citation labels have NOT been cross-checked against their primary source text. " +
  "Treat unsupported technical specifications and percentages as unverified.";
