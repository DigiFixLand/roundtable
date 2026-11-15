// ─────────────────────────────────────────────────────────────
// RoundTable — Consensus Engine (Server-side)
// ─────────────────────────────────────────────────────────────
// Orchestrates multi-round, multi-AI consensus using SSE
// streaming. Dispatches between engines and wires in the
// optional Judge synthesizer and cost meter.
//
// Engines:
//   cvp          — Consensus Validation Protocol (multi-round debate)
//   blind-jury   — Parallel independent responses + judge synthesis
//   adversarial  — Adversarial Red Team: rotating attacker stress-tests
//                  the others; defenders respond; final post-stress
//                  synthesis
//
// All engines accept an optional AbortSignal and forward it to
// every provider call.

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type {
  Participant,
  RoundType,
  ConsensusEvent,
  RoundResponse,
  ConsensusOptions,
  Disagreement,
  JudgeResult,
  DecisionRecord,
  ClaimDigest,
  ClaimContradiction,
  TokenUsage,
} from "./types";
import { findResolvedModel } from "./providers";
import { planLocalMessages } from "./context-manager";
import { reviewDecisionEvidence } from "./decision-evidence";
import type { AttachedDocument } from "./documents";
import { JUDGE_PERSONA } from "./personas";
import {
  assessResponseQuality,
  boundedDebateContext,
  compactStatement,
  EVIDENCE_NOTE,
} from "./quality-gate";
import { addUsage, estimateCost, estimateUsageFromText, ZERO_USAGE } from "./pricing";

const MAX_OUTPUT_TOKENS = 1500;
const EARLY_STOP_DELTA_THRESHOLD = 3; // consensus score delta below this = converged

/** Thrown when a cost cap fires; caught and surfaced via SSE `error` event. */
export class CostCapExceededError extends Error {
  constructor(
    public readonly runningCostUSD: number,
    public readonly capUSD: number,
  ) {
    super(`Cost cap exceeded: estimated $${runningCostUSD.toFixed(4)} > $${capUSD.toFixed(4)} cap`);
    this.name = "CostCapExceededError";
  }
}

/** Sum incremental `usage.estimatedCostUSD` and throw when the cap is crossed. */
function enforceCostCap(runningCostUSD: number, capUSD: number | undefined): void {
  if (!capUSD || capUSD <= 0) return;
  if (runningCostUSD > capUSD) {
    throw new CostCapExceededError(runningCostUSD, capUSD);
  }
}

// ── Round definitions ──────────────────────────────────────

function getRoundMeta(
  roundNumber: number,
  totalRounds: number,
): { type: RoundType; label: string } {
  if (roundNumber === 1) return { type: "initial-analysis", label: "Initial Analysis" };
  if (roundNumber === 2) return { type: "counterarguments", label: "Cross-examination" };
  if (roundNumber === 3 && totalRounds === 3)
    return { type: "synthesis", label: "Revised Position & Evidence" };
  if (roundNumber === 3) return { type: "evidence-assessment", label: "Evidence Assessment" };
  return {
    type: "synthesis",
    label:
      roundNumber === totalRounds
        ? "Final Synthesis"
        : `Synthesis & Refinement (Round ${roundNumber})`,
  };
}

// ── Prompt building ────────────────────────────────────────

function buildRoundSystemPrompt(
  persona: string,
  roundType: RoundType,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const roundInstructions: Record<RoundType, string> = {
    "initial-analysis": `This is Round ${roundNumber}/${totalRounds}: INITIAL ANALYSIS.
Provide your initial analysis of the prompt. Share your perspective, key observations, and preliminary assessment. State your confidence level (0-100) at the end.`,
    counterarguments: `This is Round ${roundNumber}/${totalRounds}: COUNTERARGUMENTS.
Review the initial analyses from the other participants below. Identify at least one specific, falsifiable weakness and name the participant whose claim you challenge. Quote or paraphrase the contested claim accurately. Name what evidence or test would resolve the dispute; do NOT merely repeat your original answer. State your updated confidence level (0-100) at the end.`,
    "evidence-assessment": `This is Round ${roundNumber}/${totalRounds}: EVIDENCE ASSESSMENT.
Evaluate the strength of evidence and reasoning presented so far. Distinguish well-supported claims from speculation. Identify areas where consensus is forming and where disagreement remains substantive. State your confidence level (0-100) at the end.`,
    synthesis: `This is Round ${roundNumber}/${totalRounds}: ${roundNumber === totalRounds ? "FINAL SYNTHESIS" : "SYNTHESIS & REFINEMENT"}.
Synthesize the earlier objections into a revised recommendation. State what changed after cross-examination, the strongest unresolved objection, an owner/role, an observable acceptance test and a rollback or stop condition. Do not claim that unsupported specifics are facts. ${roundNumber === totalRounds ? "Provide your final, considered position." : "Refine your position based on the strongest arguments presented."} State your final confidence level (0-100) at the end.`,
  };

  // Previous rounds must fit in the limited local-model context window.
  // Exclude rejected responses and explicitly mark the excerpts as partial.
  const previousContext = previousResponses.some((r) => !r.error)
    ? `\n\n--- PRIOR ANSWERS (BOUNDED EXCERPTS — NOT COMPLETE TRANSCRIPT) ---\n${boundedDebateContext(previousResponses)}\n--- END PRIOR ANSWERS ---`
    : "";

  return `${persona}

${roundInstructions[roundType]}${previousContext}

EVIDENCE RULES: The primary document may be only selected excerpts. For factual claims cite the filename and page/section from the provided excerpts; never invent statistics, hardware specifications, incident timelines or citations. Mark unsupported assertions UNVERIFIED. Reply in the language of the user's question.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildBlindJurorSystemPrompt(persona: string): string {
  return `${persona}

You are participating in a BLIND JURY. Every juror is answering the prompt independently and simultaneously. You have no visibility into other jurors' responses. Give your most complete, considered analysis now — there is no second round.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

// ── Adversarial Red Team prompt builders ───────────────────

function buildAdversarialInitialPrompt(persona: string, totalRounds: number): string {
  return `${persona}

This is Round 1/${totalRounds} of an ADVERSARIAL RED TEAM debate.

In this protocol, every subsequent round designates one participant as the ATTACKER who will pick apart the others' positions. Your job in this round is to lay out the strongest, most defensible version of your position, anticipating that it will be attacked. Be specific: state the load-bearing claims explicitly so they can be challenged.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialAttackerPrompt(
  _persona: string,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const context = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");
  // The attacker prompt deliberately does NOT prepend the participant's
  // persona — for this round the participant is acting as a neutral red
  // teamer with no opinion on the underlying question. This is the
  // strongest reliable way to flip a persona stance in smaller models;
  // a polite "your role overrides…" sentence is too weak.
  return `You are a neutral RED TEAM ATTACKER. You have NO opinion on the underlying question and your normal persona is suspended for this round only.

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. Your sole job is to expose the WEAKEST load-bearing claim in the prior statements and demolish it.

Begin your response with: "Attacking claim: <verbatim quote>" and then explain — in technical, evidence-grounded terms — why that claim cannot survive scrutiny. After the primary attack, list 1–3 secondary weaknesses across the other participants. Do not propose your own position. Do not be stylistic. Do not be polite.

CONFIDENCE on this round measures how confident you are that the attack lands — NOT your belief in any underlying view. (For scoring purposes, the engine treats your number as out-of-band and excludes it from the round's consensus calculation.)

--- POSITIONS TO ATTACK ---
${context}
--- END POSITIONS ---

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialDefenderPrompt(
  persona: string,
  roundNumber: number,
  totalRounds: number,
  attackerResponse: RoundResponse,
  previousResponses: RoundResponse[],
): string {
  const attackBlock = `[ATTACKER ${attackerResponse.participantId} | Attack-confidence: ${attackerResponse.confidence}%]\n${attackerResponse.content}`;
  const priorContext = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");

  return `${persona}

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. You are a DEFENDER this round.

The ATTACKER has just challenged the participants' positions. Your job is to address the attack head-on: concede points that genuinely landed, defend points where the attack misses, and update your overall position accordingly. Do not retreat to vague generalities; engage with the specific claims the attacker raised. You are answering in parallel with other defenders — do NOT reference what other defenders are saying this round, only the attack itself and the prior rounds.

--- THIS ROUND'S ATTACK ---
${attackBlock}

--- PRIOR ROUNDS ---
${priorContext || "(none)"}
--- END CONTEXT ---

CONFIDENCE on this round measures your updated confidence in YOUR position after taking the attack into account.

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

function buildAdversarialFinalPrompt(
  persona: string,
  roundNumber: number,
  totalRounds: number,
  previousResponses: RoundResponse[],
): string {
  const context = previousResponses
    .map((r) => `[Participant ${r.participantId} | Confidence: ${r.confidence}%]\n${r.content}`)
    .join("\n\n---\n\n");
  return `${persona}

This is Round ${roundNumber}/${totalRounds} of an ADVERSARIAL RED TEAM debate. This is the FINAL POST-STRESS SYNTHESIS round.

Your position has been attacked across the prior rounds. State your final, post-stress position. Be explicit about: which attacks landed and changed your view, which attacks missed and why, and what conditional caveats you now attach to your conclusion that you would not have attached before stress-testing.

--- DEBATE TRANSCRIPT ---
${context}
--- END TRANSCRIPT ---

IMPORTANT: End your response with a line in exactly this format:
CONFIDENCE: [number 0-100]`;
}

/** Pick the attacker for a given round in the adversarial engine.
 *  Round 2 → participant[0], Round 3 → participant[1], etc. Round-robin
 *  rotation so every participant gets to attack at least once when
 *  totalRounds-1 ≥ participants.length. */
export function pickAttackerIndex(round: number, participantCount: number): number {
  if (participantCount <= 0) return 0;
  return (round - 2) % participantCount;
}

function buildJudgeContext(finalResponses: RoundResponse[], participants: Participant[]): string {
  const blocks = finalResponses.map((r) => {
    const p = participants.find((x) => x.id === r.participantId);
    const label = p
      ? `${p.persona.name} (${p.modelInfo.providerName}/${p.modelInfo.modelId})`
      : r.participantId;
    const body = compactStatement(r.content, 900);
    return `### ${label} — self-reported confidence ${r.confidence}%\n${body}`;
  });
  return `Below are the final-round responses from every participant. Synthesize them per your instructions.\n\n${blocks.join("\n\n---\n\n")}`;
}

// ── Extraction helpers ─────────────────────────────────────

/**
 * Extract confidence score from response text (0-100, defaults to 50).
 * Matches the LAST occurrence of `CONFIDENCE: NN` in the message — the
 * protocol specifies the trailing line is the canonical confidence
 * declaration, and earlier mentions (e.g. a paragraph that uses the
 * word "confidence" inline, or a model that previews its score
 * mid-response) must not capture the value.
 */
function extractConfidence(text: string): number {
  const re = /CONFIDENCE:\s*(\d+)/gi;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = re.exec(text)) !== null) last = match;
  if (last) return Math.min(100, Math.max(0, parseInt(last[1], 10)));
  return 50;
}

function extractJudgeSection(text: string, heading: string): string {
  const pattern = new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = text.match(pattern);
  return m ? m[1].trim() : "";
}

/** Parse the fixed Phase-2 Decision Record while remaining compatible with older judge output. */
export function parseDecisionRecord(text: string): DecisionRecord {
  const legacyMajority = extractJudgeSection(text, "Majority Position");
  const legacyMinority = extractJudgeSection(text, "Minority Positions");
  const legacyUnresolved = extractJudgeSection(text, "Unresolved Disputes");
  const disagreements = extractJudgeSection(text, "Disagreements");

  return {
    consensus: extractJudgeSection(text, "Consensus") || legacyMajority,
    disagreements: disagreements || [legacyMinority, legacyUnresolved].filter(Boolean).join("\n\n"),
    uniqueInsights: extractJudgeSection(text, "Unique Insights"),
    recommendedDecision:
      extractJudgeSection(text, "Recommended Answer / Decision") || legacyMajority,
    uncertainty: extractJudgeSection(text, "Uncertainty") || legacyUnresolved,
  };
}

// ── Scoring ────────────────────────────────────────────────

function calculateConsensusScore(responses: RoundResponse[]): number {
  const valid = responses.filter((r) => !r.error && r.quality?.verdict !== "rejected");
  if (valid.length === 0) return 0;
  const avg = valid.reduce((sum, r) => sum + r.confidence, 0) / valid.length;
  const variance =
    valid.reduce((sum, r) => sum + Math.pow(r.confidence - avg, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  return Math.round(Math.max(0, Math.min(100, avg - stdDev * 0.5)));
}

// ── Randomization ──────────────────────────────────────────

/** Fisher–Yates shuffle. Non-mutating. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Disagreement detection ─────────────────────────────────

/**
 * Detect disagreements in a round using a deterministic, text-free
 * heuristic: pairs of participants whose confidence scores diverge
 * by >= 20 points. This avoids fragile regex claim-extraction and
 * extra LLM calls, while still giving a meaningful signal.
 */
export function detectDisagreements(
  round: number,
  responses: RoundResponse[],
  participants: Participant[],
): Disagreement[] {
  const out: Disagreement[] = [];
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i];
      const b = responses[j];
      if (a.error || b.error) continue;
      const delta = Math.abs(a.confidence - b.confidence);
      if (delta < 20) continue;
      const pa = participants.find((p) => p.id === a.participantId);
      const pb = participants.find((p) => p.id === b.participantId);
      const label = pa && pb ? `${pa.persona.name} vs ${pb.persona.name}` : "Confidence split";
      out.push({
        id: `r${round}-${a.participantId}-${b.participantId}`,
        round,
        participantAId: a.participantId,
        participantBId: b.participantId,
        severity: delta,
        label,
      });
    }
  }
  return out;
}

// ── Streaming a single participant ─────────────────────────

/**
 * Safely extract token usage from a streamText result. The Vercel AI
 * SDK returns `usage` as either a Promise or an object depending on
 * version; both are handled. All field reads go through type guards
 * rather than `as` casts so a malformed value falls cleanly through to
 * the `estimateUsageFromText` heuristic.
 */
async function extractUsage(
  result: { usage?: unknown } | undefined,
): Promise<{ inputTokens: number; outputTokens: number } | null> {
  if (!result || result.usage == null) return null;
  let u: unknown;
  try {
    // Tolerate both Promise<usage> and plain usage object.
    u = await (result.usage as Promise<unknown> | unknown);
  } catch {
    return null;
  }
  if (!u || typeof u !== "object") return null;
  const obj = u as Record<string, unknown>;
  const inputCandidate = obj.inputTokens ?? obj.promptTokens;
  const outputCandidate = obj.outputTokens ?? obj.completionTokens;
  const input = typeof inputCandidate === "number" ? inputCandidate : null;
  const output = typeof outputCandidate === "number" ? outputCandidate : null;
  if (input === null || output === null) return null;
  return { inputTokens: input, outputTokens: output };
}

/**
 * Format a provider error for display. Pulls out the common fields
 * that the Vercel AI SDK attaches to `AI_APICallError` (statusCode,
 * url, responseBody) and falls back to the message when they are
 * absent.
 */
function formatProviderError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err === "string" ? err : "Unknown provider error";
  const msg = err.message || err.name || "Unknown provider error";
  const info = err as unknown as {
    statusCode?: number;
    responseBody?: unknown;
    url?: string;
  };
  const parts: string[] = [msg];
  if (typeof info.statusCode === "number") parts.push(`HTTP ${info.statusCode}`);
  return parts.join(" — ");
}

async function streamParticipant(
  participant: Participant,
  systemPrompt: string,
  userPrompt: string,
  round: number,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<RoundResponse> {
  emit({ type: "participant-start", participantId: participant.id, round });

  const started = Date.now();
  let fullContent = "";
  let usage: TokenUsage | undefined;
  let errorMessage: string | undefined;

  const resolved = findResolvedModel(participant.modelInfo.id);

  if (!resolved) {
    errorMessage = `Model not available: ${participant.modelInfo.id}`;
    fullContent = `[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
    emit({ type: "token", participantId: participant.id, round, token: fullContent });
    console.error(`[RoundTable] Model resolution failed for ${participant.modelInfo.id}`);
  } else {
    try {
      const provider = createOpenAI({
        baseURL: resolved.baseUrl,
        apiKey: resolved.apiKey,
      });

      // Vercel AI SDK v6 surfaces provider errors via the `onError`
      // callback rather than throwing from `textStream`. We capture
      // them here and re-throw after the iteration so the outer
      // try/catch handles them uniformly.
      let capturedError: unknown = null;

      // Use `.chat()` — the OpenAI chat-completions endpoint
      // (`/v1/chat/completions`) is the only one every provider's
      // OpenAI-compat shim implements (Anthropic, xAI, Mistral,
      // Groq, Together, …). The default `provider(modelId)` call
      // would target `/v1/responses`, which is OpenAI-only.
      const planned =
        resolved.accessClass === "local"
          ? planLocalMessages(systemPrompt, userPrompt)
          : { system: systemPrompt, prompt: userPrompt, clipped: false };
      const result = streamText({
        model: provider.chat(resolved.modelId),
        system: planned.system,
        prompt: planned.prompt,
        maxOutputTokens: resolved.accessClass === "local" ? 800 : MAX_OUTPUT_TOKENS,
        temperature: 0.45,
        abortSignal: signal,
        onError: ({ error }: { error: unknown }) => {
          capturedError = error;
        },
      } as Parameters<typeof streamText>[0]);

      const awaited = await result;
      for await (const chunk of awaited.textStream) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        fullContent += chunk;
        emit({ type: "token", participantId: participant.id, round, token: chunk });
      }

      if (capturedError) throw capturedError;
      if (!fullContent.trim()) {
        throw new Error(
          "Model returned no final answer. Thinking-only models may exhaust the output limit; select an Instruct model.",
        );
      }

      const rawUsage = await extractUsage(awaited as { usage?: unknown });
      if (rawUsage) {
        usage = {
          inputTokens: rawUsage.inputTokens,
          outputTokens: rawUsage.outputTokens,
          totalTokens: rawUsage.inputTokens + rawUsage.outputTokens,
          estimatedCostUSD: estimateCost(
            resolved.modelId,
            rawUsage.inputTokens,
            rawUsage.outputTokens,
          ),
        };
      } else {
        usage = estimateUsageFromText(
          resolved.modelId,
          planned.system + planned.prompt,
          fullContent,
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      errorMessage = formatProviderError(err);

      console.error(
        `[RoundTable] Provider error from ${participant.modelInfo.providerName}/${participant.modelInfo.modelId}:`,
        err,
      );

      // If nothing was streamed, emit a synthetic token so the UI
      // never renders an empty card. If something WAS streamed,
      // append the error to what was already shown.
      if (fullContent.length === 0) {
        fullContent = `[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
        emit({ type: "token", participantId: participant.id, round, token: fullContent });
      } else {
        const tail = `\n\n[Error from ${participant.modelInfo.providerName} / ${participant.modelInfo.modelId}: ${errorMessage}]`;
        fullContent += tail;
        emit({ type: "token", participantId: participant.id, round, token: tail });
      }
    }
  }

  // Deterministic quality gate: repetitive/empty output is not a vote.
  // Terse or uncited content stays visible but is flagged as unverified.
  const quality = !errorMessage ? assessResponseQuality(fullContent, userPrompt) : undefined;
  if (quality && resolved?.accessClass === "local") {
    const plan = planLocalMessages(systemPrompt, userPrompt);
    if (plan.clipped) {
      quality.issues.push("PARTIAL CONTEXT: Input was trimmed to fit the MSI context window.");
      if (quality.verdict === "accepted") quality.verdict = "caution";
    }
  }
  if (quality?.verdict === "rejected") {
    errorMessage = "Quality Gate: " + quality.issues.join(" ");
  }
  const confidence = errorMessage ? 0 : extractConfidence(fullContent);
  const durationMs = Date.now() - started;

  const response: RoundResponse = {
    participantId: participant.id,
    roundNumber: round,
    content: fullContent,
    confidence,
    timestamp: Date.now(),
    durationMs,
    usage,
    error: errorMessage,
    quality,
  };

  emit({
    type: "participant-end",
    participantId: participant.id,
    round,
    confidence,
    fullContent,
    usage,
    durationMs,
    error: errorMessage,
    quality,
  });

  return response;
}

// ── Judge synthesizer ──────────────────────────────────────

async function runJudge(
  judgeModelId: string,
  finalResponses: RoundResponse[],
  participants: Participant[],
  userPrompt: string,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
  auditContext?: { documents: AttachedDocument[]; question: string },
): Promise<JudgeResult> {
  const resolved = findResolvedModel(judgeModelId);
  if (!resolved) {
    throw new Error(`Judge model not found: ${judgeModelId}`);
  }

  const provider = createOpenAI({
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
  });

  emit({ type: "judge-start", modelId: resolved.modelId, providerName: resolved.providerName });

  const validResponses = finalResponses.filter((r) => !r.error);
  const context = buildJudgeContext(validResponses, participants);
  const system = `${JUDGE_PERSONA.systemPrompt}

${auditContext ? "DECISION AUDIT: Critically review the proposed plan. Never invent names, percentages, hardware requirements or timelines. Distinguish evidence from recommendations and highlight conflicting architecture choices. The report is a draft requiring human approval." : ""}

Quality controls: ${validResponses.length} / ${finalResponses.length} final-round answers were valid.
Invalid answers are EXCLUDED. Do not treat self-reported confidence as agreement.
${EVIDENCE_NOTE}
If fewer than two independent models support a recommendation, the decision is PENDING.
For each practical recommendation list an owner, an observable acceptance test,
a rollback or stop condition, and primary-source page/section when available.
Never invent server specifications, risk percentages or operational status.
Keep the answer in the language of the original question.

Original question and selected source excerpts (PARTIAL where labeled):
"""
${compactStatement(userPrompt, 5500)}
"""`;

  let content = "";
  let usage: TokenUsage | undefined;

  try {
    let capturedError: unknown = null;

    // See streamParticipant for why we use `.chat()` here.
    const planned =
      resolved.accessClass === "local"
        ? planLocalMessages(system, context)
        : { system, prompt: context, clipped: false };
    const result = streamText({
      model: provider.chat(resolved.modelId),
      system: planned.system,
      prompt: planned.prompt,
      maxOutputTokens: resolved.accessClass === "local" ? 950 : MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      abortSignal: signal,
      onError: ({ error }: { error: unknown }) => {
        capturedError = error;
      },
    } as Parameters<typeof streamText>[0]);

    const awaited = await result;
    for await (const chunk of awaited.textStream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      content += chunk;
      emit({ type: "judge-token", token: chunk });
    }

    if (capturedError) throw capturedError;

    const rawUsage = await extractUsage(awaited as { usage?: unknown });
    if (rawUsage) {
      usage = {
        inputTokens: rawUsage.inputTokens,
        outputTokens: rawUsage.outputTokens,
        totalTokens: rawUsage.inputTokens + rawUsage.outputTokens,
        estimatedCostUSD: estimateCost(
          resolved.modelId,
          rawUsage.inputTokens,
          rawUsage.outputTokens,
        ),
      };
    } else {
      usage = estimateUsageFromText(resolved.modelId, planned.system + planned.prompt, content);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const msg = formatProviderError(err);
    console.error(
      "[RoundTable] Judge error from %s/%s:",
      resolved.providerName,
      resolved.modelId,
      err,
    );
    const tail = content.length === 0 ? `[Judge error: ${msg}]` : `\n\n[Judge error: ${msg}]`;
    content += tail;
    emit({ type: "judge-token", token: tail });
  }

  const decisionRecord = parseDecisionRecord(content);
  const requiredSections: Array<[keyof DecisionRecord, string]> = [
    ["consensus", "Consensus"],
    ["disagreements", "Disagreements"],
    ["uniqueInsights", "Unique Insights"],
    ["recommendedDecision", "Recommended Answer / Decision"],
    ["uncertainty", "Uncertainty"],
  ];
  const decisionIssues = requiredSections
    .filter(([key]) => !decisionRecord[key].trim())
    .map(([, name]) => `Missing Chairman section: ${name}`);
  // Do not call a narrative "actionable" without observable acceptance,
  // responsibility and a stop/rollback criterion.
  const actionText = decisionRecord.recommendedDecision;
  if (actionText.trim()) {
    if (!/(owner|responsible|مسئول|مالک|متولی)/iu.test(actionText))
      decisionIssues.push("Decision lacks an accountable owner or role.");
    if (!/(test|verify|validation|acceptance|آزمون|تست|پذیرش|راستی‌آزمایی)/iu.test(actionText))
      decisionIssues.push("Decision lacks a verifiable acceptance test.");
    if (!/(rollback|stop|halt|revert|بازگشت|توقف|برگردان|لغو)/iu.test(actionText))
      decisionIssues.push("Decision lacks rollback or stop conditions.");
  }
  if (validResponses.length < 2) decisionIssues.push("Fewer than two valid independent answers.");
  const independentModels = new Set(
    validResponses.map(
      (r) => participants.find((p) => p.id === r.participantId)?.modelInfo.id || r.participantId,
    ),
  );
  if (independentModels.size < 2) decisionIssues.push("Fewer than two distinct model variants.");
  if (/\[Judge error:/i.test(content)) decisionIssues.push("Chairman provider call failed.");
  const evidenceReview = auditContext
    ? reviewDecisionEvidence(
        decisionRecord,
        auditContext.documents,
        auditContext.question,
        validResponses,
      )
    : undefined;
  if (evidenceReview?.status === "blocked-needs-evidence")
    decisionIssues.push(
      "Decision Audit: source conflicts or unsupported claims require human review.",
    );
  const draftRecommendation = decisionRecord.recommendedDecision;
  const decisionStatus: "structured" | "pending" = decisionIssues.length ? "pending" : "structured";
  if (decisionStatus === "pending") {
    decisionRecord.recommendedDecision =
      "DECISION PENDING — Chairman output was incomplete or insufficiently supported. " +
      "Do not act on the generated recommendation until the missing evidence and sections are reviewed.";
    decisionRecord.uncertainty = [
      decisionRecord.uncertainty,
      "Quality gate: " + decisionIssues.join(" "),
      EVIDENCE_NOTE,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  const result: JudgeResult = {
    modelId: resolved.modelId,
    providerName: resolved.providerName,
    content,
    decisionRecord,
    decisionStatus,
    decisionIssues,
    evidenceReview,
    draftRecommendation: auditContext ? draftRecommendation : undefined,
    // Legacy aliases keep old comparisons/permalinks readable while the UI migrates.
    majorityPosition: decisionRecord.consensus,
    minorityPositions: decisionRecord.disagreements,
    unresolvedDisputes: decisionRecord.uncertainty,
    usage,
  };
  emit({ type: "judge-end", result });
  return result;
}

// ── Claim-level extractor ──────────────────────────────────

const CLAIM_EXTRACTOR_SYSTEM = `You are a CONTRADICTION EXTRACTOR. You read the final-round responses from a multi-AI debate and extract the SUBSTANTIVE semantic contradictions between participants.

Output ONLY a JSON object with the following shape — no markdown fences, no preamble, no commentary:

{
  "contradictions": [
    {
      "claim": "<one-line summary of the contested point>",
      "sides": [
        {
          "stance": "<position taken by this side, in 1 sentence>",
          "participantIds": ["<id>", ...],
          "quote": "<verbatim quote from one participant on this side, max 240 chars>"
        }
      ]
    }
  ]
}

Rules:
- Only include contradictions where TWO OR MORE participants take genuinely opposing positions on the same point. Do not invent disagreements.
- Each side must include a verbatim quote from at least one named participant on that side.
- If there are no real contradictions, return {"contradictions": []}.
- Use participant ids exactly as given (e.g., "p-1", "p-2").
- Limit to at most 6 contradictions; pick the most decision-relevant.
- Output ONLY the JSON object. No other text.`;

function buildClaimExtractorContext(
  finalResponses: RoundResponse[],
  participants: Participant[],
): string {
  const blocks = finalResponses
    .filter((r) => !r.error)
    .map((r) => {
      const p = participants.find((x) => x.id === r.participantId);
      const label = p
        ? `${r.participantId} — ${p.persona.name} (${p.modelInfo.providerName}/${p.modelInfo.modelId})`
        : r.participantId;
      const body = r.content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim();
      return `### ${label}\n${body}`;
    });
  return `Below are the final-round responses from each participant. Extract the substantive semantic contradictions between them per your instructions.\n\n${blocks.join("\n\n---\n\n")}`;
}

/** Best-effort JSON extraction from a string that may have wrapping noise. */
function extractJSONObject(text: string): unknown {
  const trimmed = text.trim();
  // Prefer the first balanced { ... } slice
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  const candidate = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** Normalise text for fuzzy quote-match: strip MD/punctuation/whitespace. */
function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_~"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verify that a quote actually appears (or substantially appears) in
 * one of the responses from the named participants. Allows minor
 * paraphrase / whitespace differences via a normalised substring
 * check on the first 80 normalised chars of the quote.
 */
function quoteAppearsInResponse(
  quote: string,
  participantIds: string[],
  contentByParticipant: Map<string, string>,
): boolean {
  if (!quote) return false;
  const needleFull = normaliseForMatch(quote);
  if (needleFull.length === 0) return false;
  // Use a stable prefix so models can paraphrase the tail without losing
  // the quote. Min 30 chars to avoid trivial match.
  const needle = needleFull.length > 80 ? needleFull.slice(0, 80) : needleFull;
  if (needle.length < 30) return false;
  for (const id of participantIds) {
    const content = contentByParticipant.get(id);
    if (!content) continue;
    if (normaliseForMatch(content).includes(needle)) return true;
  }
  return false;
}

/**
 * Parse the LLM output into ClaimContradiction[]. Defensive: any bad
 * shape becomes an empty array. Validates that each contradiction has
 * a non-empty claim, at least 2 sides, a verbatim quote per side that
 * actually appears in the named participants' responses, and that no
 * participant appears on more than one side of the same contradiction.
 */
export function parseClaimsJSON(
  rawOutput: string,
  validParticipantIds: Set<string>,
  contentByParticipant?: Map<string, string>,
): ClaimContradiction[] {
  const parsed = extractJSONObject(rawOutput);
  if (!parsed || typeof parsed !== "object") return [];
  const list = (parsed as { contradictions?: unknown }).contradictions;
  if (!Array.isArray(list)) return [];

  const out: ClaimContradiction[] = [];
  for (let i = 0; i < list.length && out.length < 8; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const claim = typeof e.claim === "string" ? e.claim.trim() : "";
    if (!claim) continue;

    const sidesIn = Array.isArray(e.sides) ? e.sides : [];
    const sides: ClaimContradiction["sides"] = [];
    const seenParticipants = new Set<string>();
    let dropEntry = false;

    for (const s of sidesIn) {
      if (!s || typeof s !== "object") continue;
      const sObj = s as Record<string, unknown>;
      const stance = typeof sObj.stance === "string" ? sObj.stance.trim() : "";
      const quote = typeof sObj.quote === "string" ? sObj.quote.trim().slice(0, 600) : "";
      const idsRaw = Array.isArray(sObj.participantIds) ? sObj.participantIds : [];
      const ids = idsRaw
        .filter((id): id is string => typeof id === "string")
        .filter((id) => validParticipantIds.has(id));
      if (!stance || ids.length === 0 || !quote) continue;

      // Reject the entire contradiction if any participant id was
      // already used on a previous side. A participant cannot
      // simultaneously support and oppose the same claim.
      for (const id of ids) {
        if (seenParticipants.has(id)) {
          dropEntry = true;
          break;
        }
      }
      if (dropEntry) break;
      ids.forEach((id) => seenParticipants.add(id));

      // If we have access to the original responses, require the
      // quote to actually appear in one of the named participants'
      // text. This catches fabricated quotes from the extractor.
      if (contentByParticipant && !quoteAppearsInResponse(quote, ids, contentByParticipant)) {
        continue;
      }

      sides.push({ stance, participantIds: ids, quote });
    }

    if (dropEntry) continue;
    if (sides.length < 2) continue;

    out.push({
      id: `claim-${i}`,
      claim: claim.slice(0, 240),
      sides,
    });
  }
  return out;
}

async function runClaimExtractor(
  modelId: string,
  finalResponses: RoundResponse[],
  participants: Participant[],
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<ClaimDigest | null> {
  const resolved = findResolvedModel(modelId);
  if (!resolved) {
    console.warn(`[RoundTable] Claim extractor: model not available: ${modelId}`);
    const digest: ClaimDigest = {
      modelId,
      providerName: "unknown",
      contradictions: [],
      rawContent: "",
      error: `Claim extractor model not available: ${modelId}`,
    };
    emit({ type: "claims-end", digest });
    return digest;
  }

  const provider = createOpenAI({
    baseURL: resolved.baseUrl,
    apiKey: resolved.apiKey,
  });

  emit({
    type: "claims-start",
    modelId: resolved.modelId,
    providerName: resolved.providerName,
  });

  const context = buildClaimExtractorContext(finalResponses, participants);
  let content = "";
  let usage: TokenUsage | undefined;
  let errorMessage: string | undefined;

  try {
    let capturedError: unknown = null;
    const planned =
      resolved.accessClass === "local"
        ? planLocalMessages(CLAIM_EXTRACTOR_SYSTEM, context)
        : { system: CLAIM_EXTRACTOR_SYSTEM, prompt: context, clipped: false };
    const result = streamText({
      model: provider.chat(resolved.modelId),
      system: planned.system,
      prompt: planned.prompt,
      maxOutputTokens: resolved.accessClass === "local" ? 700 : MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      abortSignal: signal,
      onError: ({ error }: { error: unknown }) => {
        capturedError = error;
      },
    } as Parameters<typeof streamText>[0]);

    const awaited = await result;
    for await (const chunk of awaited.textStream) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      content += chunk;
    }
    if (capturedError) throw capturedError;

    const rawUsage = await extractUsage(awaited as { usage?: unknown });
    if (rawUsage) {
      usage = {
        inputTokens: rawUsage.inputTokens,
        outputTokens: rawUsage.outputTokens,
        totalTokens: rawUsage.inputTokens + rawUsage.outputTokens,
        estimatedCostUSD: estimateCost(
          resolved.modelId,
          rawUsage.inputTokens,
          rawUsage.outputTokens,
        ),
      };
    } else {
      usage = estimateUsageFromText(resolved.modelId, planned.system + planned.prompt, content);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    errorMessage = formatProviderError(err);
    console.error(
      "[RoundTable] Claim extractor error from %s/%s:",
      resolved.providerName,
      resolved.modelId,
      err,
    );
    // Soft-fail — emit an empty digest rather than dropping the whole run.
  }

  const validIds = new Set(participants.map((p) => p.id));
  const contentByParticipant = new Map(
    finalResponses
      .filter((r) => !r.error)
      .map((r) => [r.participantId, r.content.replace(/\nCONFIDENCE:\s*\d+\s*$/i, "").trim()]),
  );
  const parsedClaims = errorMessage ? null : extractJSONObject(content);
  const rawContradictions =
    parsedClaims && typeof parsedClaims === "object"
      ? (parsedClaims as { contradictions?: unknown }).contradictions
      : undefined;
  if (!errorMessage && !Array.isArray(rawContradictions)) {
    errorMessage =
      "Claim extractor returned no valid structured JSON; disagreement status is unknown.";
  }
  const contradictions = errorMessage
    ? []
    : parseClaimsJSON(content, validIds, contentByParticipant);
  if (
    !errorMessage &&
    Array.isArray(rawContradictions) &&
    rawContradictions.length > 0 &&
    contradictions.length === 0
  ) {
    errorMessage = "Claim extractor supplied unverified quotes; disagreement status is unknown.";
  }
  const digest: ClaimDigest = {
    modelId: resolved.modelId,
    providerName: resolved.providerName,
    contradictions,
    rawContent: content,
    usage,
    ...(errorMessage ? { error: errorMessage } : {}),
  };
  emit({ type: "claims-end", digest });
  return digest;
}

/**
 * Pick the model used for the claim extractor. Prefers the judge model
 * when judge synthesis is enabled (consistency, single user choice);
 * otherwise falls back to the first participant's model.
 */
function pickClaimExtractorModelId(
  options: ConsensusOptions,
  participants: Participant[],
): string | null {
  if (options.judgeEnabled && options.judgeModelId) return options.judgeModelId;
  return participants[0]?.modelInfo.id ?? null;
}

// ── CVP Engine ─────────────────────────────────────────────

/** Sum cost from a list of responses (skips errored ones — they're free). */
function sumResponseCost(responses: RoundResponse[]): number {
  return responses.reduce((acc, r) => acc + (r.usage?.estimatedCostUSD ?? 0), 0);
}

async function runCVPConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
  auditContext?: { documents: AttachedDocument[]; question: string },
): Promise<number> {
  const totalRounds = options.rounds;
  const allResponses: RoundResponse[] = [];
  const roundScores: number[] = [];
  let roundsCompleted = 0;
  let runningCostUSD = 0;

  for (let round = 1; round <= totalRounds; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const { type, label } = getRoundMeta(round, totalRounds);
    emit({ type: "round-start", round, roundType: type, label });

    const previousResponses = allResponses.filter((r) => r.roundNumber < round);

    // Determine speaking order for this round
    const order =
      options.randomizeOrder && round > 1 ? shuffle(participants) : participants.slice();

    const roundResponses: RoundResponse[] = [];

    if (round === 1 && options.blindFirstRound) {
      // Parallel, no cross-visibility — each participant only sees an empty previous-context.
      const promises = order.map((participant) => {
        const systemPrompt = buildRoundSystemPrompt(
          participant.persona.systemPrompt +
            (options.decisionAudit
              ? participant.modelInfo.id.includes("qwen")
                ? "\nDECISION AUDIT ROLE: Evidence & architecture reviewer. Compare proposed solutions with only provided excerpts. Identify exact page citations or mark UNVERIFIED. Respond in Persian."
                : "\nDECISION AUDIT ROLE: Independent risk and security challenger. Identify one critical unsupported assumption, failure mode, test and rollback. Respond in Persian."
              : ""),
          type,
          round,
          totalRounds,
          [],
        );
        return streamParticipant(participant, systemPrompt, prompt, round, emit, signal);
      });
      const results = await Promise.all(promises);
      roundResponses.push(...results);
    } else {
      // Sequential — later participants see earlier ones from this round
      for (const participant of order) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        const visibleContext = [
          ...previousResponses,
          ...roundResponses, // what earlier participants said in THIS round
        ];

        const systemPrompt = buildRoundSystemPrompt(
          participant.persona.systemPrompt +
            (options.decisionAudit
              ? participant.modelInfo.id.includes("qwen")
                ? "\nDECISION AUDIT ROLE: Evidence & architecture reviewer. Compare proposed solutions with only provided excerpts. Identify exact page citations or mark UNVERIFIED. Respond in Persian."
                : "\nDECISION AUDIT ROLE: Independent risk and security challenger. Identify one critical unsupported assumption, failure mode, test and rollback. Respond in Persian."
              : ""),
          type,
          round,
          totalRounds,
          visibleContext,
        );

        const response = await streamParticipant(
          participant,
          systemPrompt,
          prompt,
          round,
          emit,
          signal,
        );
        roundResponses.push(response);
      }
    }

    allResponses.push(...roundResponses);
    runningCostUSD += sumResponseCost(roundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);

    const consensusScore = calculateConsensusScore(roundResponses);
    roundScores.push(consensusScore);
    emit({ type: "round-end", round, consensusScore });

    const disagreements = detectDisagreements(round, roundResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round, disagreements });
    }

    roundsCompleted = round;

    // Convergence check — requires at least round 2 before we can look at a delta
    if (options.earlyStop && round >= 2 && round < totalRounds) {
      const delta = Math.abs(consensusScore - roundScores[round - 2]);
      if (delta <= EARLY_STOP_DELTA_THRESHOLD) {
        const reason = `Consensus score delta ${delta.toFixed(1)} between rounds ${round - 1} and ${round} is at or below the convergence threshold (${EARLY_STOP_DELTA_THRESHOLD}).`;
        emit({ type: "early-stop", round, delta, reason });
        break;
      }
    }
  }

  const lastRoundNumber = roundsCompleted;
  const lastRoundResponses = allResponses.filter((r) => r.roundNumber === lastRoundNumber);
  const finalScore = calculateConsensusScore(lastRoundResponses);

  if (options.judgeEnabled && options.judgeModelId) {
    const judge = await runJudge(
      options.judgeModelId,
      lastRoundResponses,
      participants,
      prompt,
      emit,
      signal,
      auditContext,
    );
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(
        claimsModelId,
        lastRoundResponses,
        participants,
        emit,
        signal,
      );
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
  }

  emit({
    type: "consensus-complete",
    finalScore,
    summary: `CVP completed ${roundsCompleted} round${roundsCompleted !== 1 ? "s" : ""} with ${participants.length} participants. Final consensus score: ${finalScore}%.`,
    roundsCompleted,
  });

  return finalScore;
}

// ── Blind Jury Engine ──────────────────────────────────────

async function runBlindJuryConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<number> {
  let runningCostUSD = 0;

  // One and only round — parallel, no cross-visibility.
  emit({
    type: "round-start",
    round: 1,
    roundType: "initial-analysis",
    label: "Blind Jury Deliberation",
  });

  const results = await Promise.all(
    participants.map((p) =>
      streamParticipant(
        p,
        buildBlindJurorSystemPrompt(p.persona.systemPrompt),
        prompt,
        1,
        emit,
        signal,
      ),
    ),
  );

  runningCostUSD += sumResponseCost(results);
  enforceCostCap(runningCostUSD, options.costCapUSD);

  const consensusScore = calculateConsensusScore(results);
  emit({ type: "round-end", round: 1, consensusScore });

  const disagreements = detectDisagreements(1, results, participants);
  if (disagreements.length > 0) {
    emit({ type: "disagreements", round: 1, disagreements });
  }

  // Blind Jury always runs the judge if a model is available.
  if (options.judgeEnabled && options.judgeModelId) {
    const judge = await runJudge(options.judgeModelId, results, participants, prompt, emit, signal);
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(claimsModelId, results, participants, emit, signal);
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
  }

  emit({
    type: "consensus-complete",
    finalScore: consensusScore,
    summary: `Blind Jury reached a consensus score of ${consensusScore}% across ${participants.length} independent jurors.`,
    roundsCompleted: 1,
  });

  return consensusScore;
}

// ── Adversarial Red Team Engine ────────────────────────────

async function runAdversarialConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
): Promise<number> {
  const totalRounds = options.rounds;
  const allResponses: RoundResponse[] = [];
  let runningCostUSD = 0;

  // Round 1 — initial parallel positions
  emit({
    type: "round-start",
    round: 1,
    roundType: "initial-analysis",
    label: "Initial Positions",
  });

  const r1 = await Promise.all(
    participants.map((p) =>
      streamParticipant(
        p,
        buildAdversarialInitialPrompt(p.persona.systemPrompt, totalRounds),
        prompt,
        1,
        emit,
        signal,
      ),
    ),
  );
  allResponses.push(...r1);
  runningCostUSD += sumResponseCost(r1);
  enforceCostCap(runningCostUSD, options.costCapUSD);
  const r1Score = calculateConsensusScore(r1);
  emit({ type: "round-end", round: 1, consensusScore: r1Score });
  const r1Disagreements = detectDisagreements(1, r1, participants);
  if (r1Disagreements.length > 0) {
    emit({ type: "disagreements", round: 1, disagreements: r1Disagreements });
  }

  // Rounds 2..N-1 — stress test rounds (one attacker, rest defend)
  // For totalRounds == 1 we are done after R1.
  // For totalRounds == 2 the only "extra" round becomes the final synthesis.
  for (let round = 2; round < totalRounds; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const attackerIdx = pickAttackerIndex(round, participants.length);
    const attacker = participants[attackerIdx];
    const defenders = participants.filter((_, i) => i !== attackerIdx);

    emit({
      type: "round-start",
      round,
      roundType: "counterarguments",
      label: `Stress Test — Attacker: ${attacker.persona.name}`,
    });

    const previousResponses = allResponses.filter((r) => r.roundNumber < round);
    const roundResponses: RoundResponse[] = [];

    // Attacker speaks first
    const attackerResponse = await streamParticipant(
      attacker,
      buildAdversarialAttackerPrompt(
        attacker.persona.systemPrompt,
        round,
        totalRounds,
        previousResponses,
      ),
      prompt,
      round,
      emit,
      signal,
    );
    roundResponses.push(attackerResponse);

    // Defenders respond IN PARALLEL — each sees only the attacker and
    // prior rounds, never other defenders this round. This matches the
    // anti-anchoring philosophy of CVP's blind round 1 and the parallel
    // final synthesis below.
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const defenderResponses = await Promise.all(
      defenders.map((defender) =>
        streamParticipant(
          defender,
          buildAdversarialDefenderPrompt(
            defender.persona.systemPrompt,
            round,
            totalRounds,
            attackerResponse,
            previousResponses,
          ),
          prompt,
          round,
          emit,
          signal,
        ),
      ),
    );
    roundResponses.push(...defenderResponses);

    allResponses.push(...roundResponses);
    runningCostUSD += sumResponseCost(roundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);

    // The attacker's confidence measures attack-success, not belief in a
    // position, so it is OUT-OF-BAND for the consensus formula. Score
    // and disagreement detection use defender responses only on stress
    // rounds. This keeps the (avg - 0.5*stddev) interpretation
    // consistent across rounds and engines.
    const score = calculateConsensusScore(defenderResponses);
    emit({ type: "round-end", round, consensusScore: score });
    const disagreements = detectDisagreements(round, defenderResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round, disagreements });
    }
  }

  // Final round — post-stress synthesis (every participant in parallel)
  // Skip if totalRounds == 1 (everything was Round 1).
  let finalRoundResponses: RoundResponse[] = r1;
  let finalRoundNumber = 1;
  if (totalRounds >= 2) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const finalRound = totalRounds;
    emit({
      type: "round-start",
      round: finalRound,
      roundType: "synthesis",
      label: "Post-Stress Final Synthesis",
    });
    const previous = allResponses.filter((r) => r.roundNumber < finalRound);
    finalRoundResponses = await Promise.all(
      participants.map((p) =>
        streamParticipant(
          p,
          buildAdversarialFinalPrompt(p.persona.systemPrompt, finalRound, totalRounds, previous),
          prompt,
          finalRound,
          emit,
          signal,
        ),
      ),
    );
    allResponses.push(...finalRoundResponses);
    runningCostUSD += sumResponseCost(finalRoundResponses);
    enforceCostCap(runningCostUSD, options.costCapUSD);
    const score = calculateConsensusScore(finalRoundResponses);
    emit({ type: "round-end", round: finalRound, consensusScore: score });
    const disagreements = detectDisagreements(finalRound, finalRoundResponses, participants);
    if (disagreements.length > 0) {
      emit({ type: "disagreements", round: finalRound, disagreements });
    }
    finalRoundNumber = finalRound;
  }

  const finalScore = calculateConsensusScore(finalRoundResponses);

  if (options.judgeEnabled && options.judgeModelId) {
    const judge = await runJudge(
      options.judgeModelId,
      finalRoundResponses,
      participants,
      prompt,
      emit,
      signal,
    );
    runningCostUSD += judge.usage?.estimatedCostUSD ?? 0;
    enforceCostCap(runningCostUSD, options.costCapUSD);
  }

  if (options.extractClaimsEnabled) {
    const claimsModelId = pickClaimExtractorModelId(options, participants);
    if (claimsModelId) {
      const digest = await runClaimExtractor(
        claimsModelId,
        finalRoundResponses,
        participants,
        emit,
        signal,
      );
      runningCostUSD += digest?.usage?.estimatedCostUSD ?? 0;
      enforceCostCap(runningCostUSD, options.costCapUSD);
    }
  }

  emit({
    type: "consensus-complete",
    finalScore,
    summary: `Adversarial Red Team completed ${finalRoundNumber} round${finalRoundNumber !== 1 ? "s" : ""} with ${participants.length} participants. Final post-stress consensus score: ${finalScore}%.`,
    roundsCompleted: finalRoundNumber,
  });

  return finalScore;
}

// ── Public entrypoint ──────────────────────────────────────

export async function runConsensus(
  prompt: string,
  participants: Participant[],
  options: ConsensusOptions,
  emit: (event: ConsensusEvent) => void,
  signal?: AbortSignal,
  auditContext?: { documents: AttachedDocument[]; question: string },
): Promise<void> {
  if (options.engine === "blind-jury") {
    await runBlindJuryConsensus(prompt, participants, options, emit, signal);
  } else if (options.engine === "adversarial") {
    await runAdversarialConsensus(prompt, participants, options, emit, signal);
  } else {
    await runCVPConsensus(prompt, participants, options, emit, signal, auditContext);
  }
}

// ── Exports for tests ──────────────────────────────────────

export const __testing = {
  calculateConsensusScore,
  detectDisagreements,
  extractConfidence,
  extractJudgeSection,
  getRoundMeta,
  shuffle,
  buildRoundSystemPrompt,
  buildBlindJurorSystemPrompt,
  buildJudgeContext,
  buildAdversarialInitialPrompt,
  buildAdversarialAttackerPrompt,
  buildAdversarialDefenderPrompt,
  buildAdversarialFinalPrompt,
  pickAttackerIndex,
  parseClaimsJSON,
  pickClaimExtractorModelId,
  ZERO_USAGE,
  addUsage,
};
