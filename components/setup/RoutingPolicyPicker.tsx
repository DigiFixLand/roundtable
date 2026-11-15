"use client";

import { useArenaStore } from "@/lib/store";
import type { PrivacyMode } from "@/lib/model-policy";

const options: { value: PrivacyMode; label: string; detail: string }[] = [
  {
    value: "local-only",
    label: "Local only",
    detail: "Keep document analysis on MSI; no cloud AI requests.",
  },
  {
    value: "cloud-allowed",
    label: "Allow free cloud AI",
    detail: "Send questions and attached text to selected free-tier providers.",
  },
  {
    value: "ask-before-sharing",
    label: "Ask before cloud use",
    detail: "Confirm each run before any cloud model receives the question or document.",
  },
];

export default function RoutingPolicyPicker() {
  const privacy = useArenaStore((s) => s.options.privacyMode ?? "local-only");
  const set = useArenaStore((s) => s.setOption);
  const isRunning = useArenaStore((s) => s.isRunning);
  return (
    <section
      className="rounded-card border border-border bg-surface p-4 sm:p-5"
      aria-label="Model routing and document privacy"
    >
      <h2 className="text-base font-semibold text-fg">Model routing & document privacy</h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        Free-first: paid API requests are locked on the server until deliberately enabled by an
        administrator. Local models have no API usage charge.
      </p>
      <fieldset className="mt-3 space-y-2" disabled={isRunning}>
        <legend className="text-sm font-medium text-fg">Where may the models run?</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
          >
            <input
              className="mt-1 accent-current"
              type="radio"
              name="privacyMode"
              value={o.value}
              checked={privacy === o.value}
              onChange={() => set("privacyMode", o.value)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="text-xs text-fg-muted">{o.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-3 text-xs font-medium text-fg">
        Billing mode: Free only (paid models disabled)
      </p>
      <p className="text-xs text-fg-muted">
        Some free cloud APIs require a key and have quotas. If a quota is exhausted, the run fails
        instead of switching to a paid provider. The default mode never authorizes billing.
      </p>
    </section>
  );
}
