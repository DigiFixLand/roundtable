"use client";

// ─────────────────────────────────────────────────────────────
// Session Menu — Export ▾ (Markdown / JSON / copy permalink)
// ─────────────────────────────────────────────────────────────

import { toast } from "sonner";
import { FileJson, FileText, Link2, Share2 } from "lucide-react";
import { exportSnapshot } from "@/lib/export";
import { decisionAuditToMarkdown } from "@/lib/decision-report";
import { downloadBlob, snapshotFilename } from "@/lib/session";
import { encodeSnapshotToHash } from "@/lib/session";
import { useArenaStore } from "@/lib/store";
import { Menu, type ButtonSize, type ButtonVariant } from "@/components/ui";

export interface SessionMenuProps {
  size?: ButtonSize;
  variant?: ButtonVariant;
  align?: "start" | "end";
  className?: string;
}

/** Put `text` on the clipboard; false when the API is missing or refuses. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Export menu over the store's current snapshot. The caller decides when it is offered. */
export default function SessionMenu({
  size = "sm",
  variant = "secondary",
  align = "end",
  className,
}: SessionMenuProps = {}) {
  const getSnapshot = useArenaStore((s) => s.getSnapshot);
  const decisionAudit = useArenaStore((s) => (s.runOptions ?? s.options).decisionAudit);

  const copyPermalink = async () => {
    let url: string;
    try {
      if (getSnapshot().documents?.length) {
        toast.error(
          "Permalinks are disabled for sessions with private documents. Use private export instead.",
        );
        return;
      }
      const encoded = await encodeSnapshotToHash(getSnapshot());
      url = `${window.location.origin}${window.location.pathname}#${encoded}`;
    } catch {
      toast.error("Failed to build permalink");
      return;
    }
    if (await copyToClipboard(url)) toast.success("Permalink copied to clipboard");
    else toast.error("Couldn’t copy the permalink — the clipboard is unavailable");
  };

  return (
    <Menu
      label={
        <>
          <Share2 aria-hidden className="h-4 w-4" />
          Export
        </>
      }
      aria-label="Export"
      size={size}
      variant={variant}
      align={align}
      className={className}
      items={[
        ...(decisionAudit
          ? [
              {
                id: "decision-audit-report",
                label: "Download Decision Audit Report",
                description: "Draft action plan, evidence gaps and human approval gates",
                icon: <FileText className="h-4 w-4 text-fg-muted" />,
                onSelect: () => {
                  const snapshot = getSnapshot();
                  downloadBlob(
                    snapshotFilename(snapshot, "decision-audit.md"),
                    decisionAuditToMarkdown(snapshot),
                    "text/markdown;charset=utf-8",
                  );
                  toast.success("Decision Audit report downloaded");
                },
              },
            ]
          : []),
        {
          id: "markdown",
          label: "Download Markdown",
          description: "Readable report with every round",
          icon: <FileText className="h-4 w-4 text-fg-muted" />,
          onSelect: () => {
            exportSnapshot(getSnapshot(), "md");
            toast.success("Markdown downloaded");
          },
        },
        {
          id: "json",
          label: "Download JSON",
          description: "Full snapshot, re-loadable",
          icon: <FileJson className="h-4 w-4 text-fg-muted" />,
          onSelect: () => {
            exportSnapshot(getSnapshot(), "json");
            toast.success("JSON downloaded");
          },
        },
        {
          id: "permalink",
          label: "Copy permalink",
          description: "Read-only link with the run inside",
          icon: <Link2 className="h-4 w-4 text-fg-muted" />,
          onSelect: () => void copyPermalink(),
        },
      ]}
    />
  );
}
