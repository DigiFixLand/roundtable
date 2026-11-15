import type { SessionSnapshot } from "./types";

/** Standalone, human-review-required action report. Never automatically creates tasks. */
export function decisionAuditToMarkdown(snapshot: SessionSnapshot): string {
  const j = snapshot.judge;
  const check = j?.evidenceReview;
  const final = snapshot.rounds.at(-1)?.responses ?? [];
  const names = new Map(
    snapshot.participants.map((p) => [p.id, p.persona.name + " — " + p.modelInfo.modelId]),
  );
  const valid = final.filter((r) => !r.error);
  const invalid = final.filter((r) => !!r.error);
  const primary = (snapshot.documents ?? []).filter((d) => !d.name.endsWith("-manual-answer.txt"));
  const manual = (snapshot.documents ?? []).filter((d) => d.name.endsWith("-manual-answer.txt"));
  const lines = [
    "# Decision Audit — Engineering Decision Draft",
    "",
    "**Status: HUMAN REVIEW REQUIRED — NOT APPROVED FOR PRODUCTION**",
    `**Date:** ${new Date(snapshot.createdAt).toISOString()}`,
    `**Source documents:** ${primary.map((d) => d.name + " (" + d.pages.length + " pages/sections)").join(", ") || "none"}`,
    `**Other AI suggestions (unverified):** ${manual.map((d) => d.name).join(", ") || "none"}`,
    `**Final-round participants:** ${valid.length} usable, ${invalid.length} excluded`,
    `**Chairman format:** ${j?.decisionStatus ?? "not available"}`,
    `**Source screen:** ${check?.status ?? "not performed"}`,
    "",
    "## 1. Question / requested decision",
    snapshot.prompt,
    "",
    "## 2. Evidence screen (mechanical, NOT semantic verification)",
    check?.disclaimer ?? "No source-evidence screening was performed.",
    `References detected: ${check?.referencesFound ?? 0}. Existing-page references: ${check?.referencesToExistingPages ?? 0}.`,
  ];
  for (const flag of check?.findings ?? []) {
    lines.push(
      `- **${flag.level.toUpperCase()}** ${flag.message}${flag.detail ? " — " + flag.detail : ""}`,
    );
  }
  if (!check?.findings?.length)
    lines.push("- No mechanical evidence flags. This does NOT certify the factual claims.");
  lines.push(
    "",
    "## 3. Decision alternatives, disagreements and uncertainties",
    j?.decisionRecord?.disagreements || "Not supplied.",
    "",
    "## 4. Chairman recommendation — DRAFT ONLY",
    j?.draftRecommendation ||
      j?.decisionRecord?.recommendedDecision ||
      "No actionable recommendation was generated.",
    "",
    "## 5. Action plan and acceptance/rollback gates",
    "Extract any action from the draft above only after assigning a real owner and verifying every claimed fact.",
    "Acceptance tests and rollback triggers must be checked against the actual systems, not inferred from an AI response.",
    "",
    "## 6. Unresolved issues / required verification",
    j?.decisionRecord?.uncertainty || "No assessment provided.",
    ...(j?.decisionIssues?.length ? [...j.decisionIssues.map((x) => "- " + x)] : []),
    "",
    "## 7. Source-review notes",
    "Citations indicate a page or quotation was referenced; this report does NOT guarantee that a page supports the related claim.",
    "Long local report sessions may receive only selected excerpts; review the original files before approval.",
    "",
    "## 8. Model review status",
  );
  for (const r of final) {
    lines.push(
      `- **${names.get(r.participantId) || r.participantId}**: ${r.error ? "EXCLUDED: " + r.error : r.quality?.verdict || "not rated"}`,
    );
  }
  lines.push(
    "",
    "## Final control",
    "**NO-GO for automated deployment.** A human owner must verify sources, approve the architecture, and explicitly authorize every operational change.",
    "",
  );
  return lines.join("\n");
}
