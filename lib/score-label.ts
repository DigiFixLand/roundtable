// ─────────────────────────────────────────────────────────────
// RoundTable — Plain-language labels for scores, rounds, engines
// ─────────────────────────────────────────────────────────────
// One shared vocabulary so Setup, Run and History never invent
// their own wording for the same thing.

import type { EngineType, RoundType } from "./types";

export type ScoreTone = "success" | "info" | "warning" | "danger";

export interface ScoreLabel {
  /** Short plain-language band name, e.g. "Strong agreement". */
  label: string;
  /** Semantic tone for badges / colour tokens. */
  tone: ScoreTone;
  /** One-sentence explanation of what the band means. */
  description: string;
}

/**
 * How the consensus score is computed — mirrors `calculateConsensusScore`
 * in `lib/consensus-engine.ts`. Use as tooltip text next to the score.
 */
export const SCORE_EXPLAINER =
  "Each participant ends every answer with a self-reported confidence (0–100). " +
  "A round's score is the average confidence minus half the spread (standard deviation) " +
  "between participants, clamped to 0–100, so high confidence only scores well when " +
  "everyone is close. Errored or quality-rejected answers are ignored. This is not factual claim agreement. In Red team rounds the attacker's " +
  "confidence is left out.";

const BANDS: Array<{ min: number } & ScoreLabel> = [
  {
    min: 80,
    label: "High confidence alignment",
    tone: "success",
    description:
      "Self-reported confidence values are high and similar; actual claims may still conflict.",
  },
  {
    min: 60,
    label: "Moderate confidence alignment",
    tone: "info",
    description: "Confidence values are moderately aligned; this is not a claim-level consensus.",
  },
  {
    min: 40,
    label: "Mixed confidence",
    tone: "warning",
    description:
      "Reported confidence is middling or spread; read the actual decisions and evidence.",
  },
  {
    min: Number.NEGATIVE_INFINITY,
    label: "Low confidence alignment",
    tone: "danger",
    description:
      "Reported confidence is low or far apart; disagreement must be evaluated from claims.",
  },
];

const NO_SCORE: ScoreLabel = {
  label: "No score yet",
  tone: "info",
  description: "The score appears once the first round completes.",
};

/**
 * Map a 0–100 consensus score onto a plain-language band:
 * ≥ 80 strong agreement · 60–79 broad agreement with reservations ·
 * 40–59 split · < 40 deep disagreement. `null`/`undefined`/`NaN`
 * returns a neutral "No score yet" label.
 */
export function scoreLabel(score: number | null | undefined): ScoreLabel {
  if (score === null || score === undefined || Number.isNaN(score)) return { ...NO_SCORE };
  const band = BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
  return { label: band.label, tone: band.tone, description: band.description };
}

const ROUND_LABELS: Record<RoundType, { short: string; long: string }> = {
  "initial-analysis": { short: "Initial", long: "Initial analysis" },
  counterarguments: { short: "Counter", long: "Counterarguments" },
  "evidence-assessment": { short: "Evidence", long: "Evidence assessment" },
  synthesis: { short: "Synthesis", long: "Synthesis" },
};

/**
 * Human label for a round type. `short` (default) fits a segmented
 * control ("R2 Counter"); `long` reads well in headings.
 */
export function roundTypeLabel(type: RoundType, variant: "short" | "long" = "short"): string {
  const entry = ROUND_LABELS[type];
  if (!entry) return String(type);
  return entry[variant];
}

const ENGINE_LABELS: Record<EngineType, { name: string; short: string; description: string }> = {
  cvp: {
    name: "Debate (CVP)",
    short: "Debate",
    description:
      "Models see and answer each other over N rounds. Best for nuanced questions where you want to see positions move.",
  },
  "blind-jury": {
    name: "Blind jury",
    short: "Blind jury",
    description:
      "Everyone answers once, independently, then a judge summarises. Cheapest and immune to anchoring.",
  },
  adversarial: {
    name: "Red team",
    short: "Red team",
    description:
      "A rotating attacker tries to break each position before the final synthesis. Best for stress-testing a plan.",
  },
};

/** Plain-language engine name, e.g. `engineLabel("cvp")` → "Debate (CVP)". */
export function engineLabel(engine: EngineType, variant: "name" | "short" = "name"): string {
  const entry = ENGINE_LABELS[engine];
  if (!entry) return String(engine);
  return entry[variant];
}

/** One-line plain-language description of what an engine does. */
export function engineDescription(engine: EngineType): string {
  return ENGINE_LABELS[engine]?.description ?? "";
}
