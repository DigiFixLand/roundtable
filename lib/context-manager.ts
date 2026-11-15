/**
 * Conservative context governor for the MSI models (default Ollama num_ctx 4096).
 *
 * This is a PRE-FLIGHT estimator, not a claim to model-specific tokenizer
 * accuracy. It keeps substantial headroom for output and model wrappers;
 * if a provider still rejects a request, the error is surfaced visibly.
 */
export const LOCAL_CONTEXT_WINDOW = 4096;
export const LOCAL_RESERVED_OUTPUT = 900;
export const LOCAL_WRAPPER_MARGIN = 420;
export const LOCAL_INPUT_BUDGET =
  LOCAL_CONTEXT_WINDOW - LOCAL_RESERVED_OUTPUT - LOCAL_WRAPPER_MARGIN;

export interface PlannedLocalMessages {
  system: string;
  prompt: string;
  estimatedInputTokens: number;
  clipped: boolean;
  warning?: string;
}

/** Intentionally conservative for Persian + mixed-language document text. */
export function estimateLocalTokens(text: string): number {
  const ascii = (text.match(/[\x00-\x7f]/g) ?? []).length;
  const nonAscii = text.length - ascii;
  return Math.ceil(ascii / 2.7 + nonAscii * 1.35);
}

function compactText(text: string, maxTokens: number, marker: string): string {
  if (estimateLocalTokens(text) <= maxTokens) return text;
  if (maxTokens < 70) return marker;
  const safe = Math.max(16, maxTokens - estimateLocalTokens(marker) - 10);
  const length = text.length;
  let low = 0;
  let high = length;
  let cut = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const head = Math.floor(middle * 0.58);
    const tail = middle - head;
    const candidate = text.slice(0, head) + marker + text.slice(length - tail);
    if (estimateLocalTokens(candidate) <= safe) {
      cut = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  const head = Math.floor(cut * 0.58);
  const tail = cut - head;
  return text.slice(0, head) + marker + text.slice(length - tail);
}

/** Allocate context between instructions, original question and evidence. */
export function planLocalMessages(system: string, prompt: string): PlannedLocalMessages {
  const fullSize = estimateLocalTokens(system + prompt);
  if (fullSize <= LOCAL_INPUT_BUDGET) {
    return { system, prompt, estimatedInputTokens: fullSize, clipped: false };
  }
  const systemBudget = Math.min(820, Math.max(400, Math.floor(LOCAL_INPUT_BUDGET * 0.36)));
  const marker = "\n[PARTIAL CONTEXT — omitted to fit local model; never infer missing evidence]\n";
  const compactSystem = compactText(system, systemBudget, marker);
  const remaining = LOCAL_INPUT_BUDGET - estimateLocalTokens(compactSystem) - 28;
  const sep = prompt.indexOf("--- SELECTED DOCUMENT EXCERPTS");
  const referenceSep = prompt.indexOf("--- MANUALLY IMPORTED AI OPINIONS");
  const firstSep = [sep, referenceSep].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? -1;

  let compactPrompt: string;
  if (firstSep < 0) {
    compactPrompt = compactText(prompt, remaining, marker);
  } else {
    const question = prompt.slice(0, firstSep);
    const evidence = prompt.slice(firstSep);
    // Keep most of the original question when it is lengthy, but reserve
    // a meaningful evidence budget; any removed text is explicitly labeled.
    const questionBudget = Math.min(
      Math.floor(remaining * 0.56),
      Math.max(420, estimateLocalTokens(question)),
    );
    const sourceBudget = remaining - questionBudget - 12;
    const q = compactText(question, questionBudget, marker);
    const e = compactText(evidence, sourceBudget, marker);
    compactPrompt = q + "\n" + e;
  }
  while (
    estimateLocalTokens(compactSystem + compactPrompt) > LOCAL_INPUT_BUDGET &&
    compactPrompt.length > 100
  ) {
    compactPrompt = compactText(compactPrompt, estimateLocalTokens(compactPrompt) - 80, marker);
  }
  const estimatedInputTokens = estimateLocalTokens(compactSystem + compactPrompt);
  return {
    system: compactSystem,
    prompt: compactPrompt,
    estimatedInputTokens,
    clipped: true,
    warning:
      "Local input trimmed to fit 4096-token context. Portions of the question, prior debate or evidence may be omitted.",
  };
}
