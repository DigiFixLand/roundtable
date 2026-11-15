// Server-generated model trust/cost metadata. Never accept this classification from the browser.
// Unknown or unclassified remote providers are ALWAYS treated as paid.
export type AccessClass = "local" | "free-cloud" | "paid-cloud";
export type PrivacyMode = "local-only" | "cloud-allowed" | "ask-before-sharing";
export type CostMode = "free-only" | "paid-allowed";

// Only OpenRouter's explicit :free variant is automatically a zero-priced
// cloud model. Gemini/Groq free tiers depend on the account/project and must
// never be inferred from a customer-controlled provider label alone.

export function classifyModel(
  providerId: string,
  baseUrl: string,
  modelId: string,
  billingTier: unknown,
): AccessClass {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return "paid-cloud";
  }
  if (
    providerId === "ollama" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    url.port === "11434" &&
    (url.pathname === "/v1" || url.pathname === "/v1/") &&
    !/(?:^|[/:_-])cloud(?:$|[/:_-])/i.test(modelId)
  )
    return "local";

  if (
    billingTier === "free" &&
    providerId === "openrouter-free" &&
    url.protocol === "https:" &&
    url.hostname === "openrouter.ai" &&
    !url.port &&
    !url.username &&
    !url.password &&
    (url.pathname === "/api/v1" || url.pathname === "/api/v1/") &&
    (modelId === "openrouter/free" || /^[a-z0-9][a-z0-9/._-]{1,120}:free$/.test(modelId))
  )
    return "free-cloud";

  return "paid-cloud";
}

export interface RunPolicy {
  privacyMode?: PrivacyMode;
  costMode?: CostMode;
  cloudApproved?: boolean;
  paidApproved?: boolean;
}
export interface PolicyModel {
  accessClass: AccessClass;
  providerName: string;
  modelId: string;
}

/** Enforce routing in the server before any SDK/client request is created. */
export function enforceModelPolicy(
  models: readonly PolicyModel[],
  policy: RunPolicy,
  paidEnabledOnServer: boolean,
): string | null {
  const privacy = policy.privacyMode ?? "local-only";
  const cost = policy.costMode ?? "free-only";
  if (!["local-only", "cloud-allowed", "ask-before-sharing"].includes(privacy))
    return "Unknown privacy mode";
  if (!["free-only", "paid-allowed"].includes(cost)) return "Unknown cost mode";
  const cloud = models.filter((m) => m.accessClass !== "local");
  if (privacy === "local-only" && cloud.length)
    return "Local only: replace cloud seats (including judge) with local models";
  if (privacy === "ask-before-sharing" && cloud.length && policy.cloudApproved !== true) {
    return "Cloud use requires confirmation for this run";
  }
  if (models.some((m) => m.accessClass !== "local" && m.accessClass !== "free-cloud")) {
    if (cost !== "paid-allowed" || policy.paidApproved !== true || !paidEnabledOnServer) {
      return "Paid API models are locked. No chargeable requests were sent.";
    }
  }
  return null;
}
