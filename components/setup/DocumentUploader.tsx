"use client";
import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { useArenaStore } from "@/lib/store";
import {
  MAX_DOCUMENTS,
  MAX_DOCUMENT_CHARS,
  MAX_DOCUMENT_BYTES,
  validateDocuments,
} from "@/lib/documents";
import type { AttachedDocument } from "@/lib/documents";
import { Button, Card } from "@/components/ui";

export default function DocumentUploader() {
  const docs = useArenaStore((s) => s.documents);
  const add = useArenaStore((s) => s.addDocument);
  const remove = useArenaStore((s) => s.removeDocument);
  const isRunning = useArenaStore((s) => s.isRunning);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const total = docs.reduce((n, d) => n + d.charCount, 0);
  async function upload(file: File) {
    setError("");
    if (docs.length >= MAX_DOCUMENTS) {
      setError("Remove a file before attaching another.");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("Maximum file size is 8 MB.");
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        body,
        cache: "no-store",
      });
      const json = (await res.json()) as { document?: AttachedDocument; error?: string };
      if (!res.ok || !json.document) throw Error(json.error || "Extraction failed");
      const verified = validateDocuments([json.document])[0];
      if (total + verified.charCount > MAX_DOCUMENT_CHARS)
        throw Error("Combined text exceeds 120,000 characters.");
      add(verified);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this file");
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <Card as="section" aria-label="Attached documents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-fg">Attached documents</h2>
          <p className="text-[13px] text-fg-muted">
            PDF, Word (.docx), TXT, Markdown • Up to 3 files, 8 MB each
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={isRunning || loading || docs.length >= MAX_DOCUMENTS}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {loading ? "Reading…" : "Add document"}
        </Button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf"
          aria-label="Upload document"
          disabled={isRunning || loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate" title={d.name}>
                {d.name}
              </span>
              <span className="text-xs text-fg-muted">
                {d.pages.length} {d.format === "pdf" ? "pages" : "sections"} •{" "}
                {d.charCount.toLocaleString()} chars
              </span>
              <button
                type="button"
                title="Remove document"
                aria-label={`Remove ${d.name}`}
                disabled={isRunning}
                onClick={() => remove(d.id)}
                className="rounded p-1 hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-fg-muted">
        Extraction happens on this private RoundTable server. Original files are not saved;
        extracted text is sent to selected AI providers when you run and saved in private session
        History for follow-up questions. Files with scanned image-only pages require OCR. PDF
        charts/images are not yet visually interpreted. Never attach passwords, tokens or customer
        data.
      </p>
    </Card>
  );
}
