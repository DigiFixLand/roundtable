# RoundTable: private document context (pilot)

Document uploads are separate from the 10,000-character question. This feature is for the **protected RoundTable app**, not for HUB integration.

## User flow

1. In Setup enter a concise question (up to 10,000 characters).
2. Under Attached documents select `Add document` and attach up to three PDF, DOCX, Markdown or TXT files.
3. The extraction API returns text with page numbers (PDF) or numbered sections (other types), and the browser shows names and counts. It never stores the original file bytes.
4. Choose at least two models and run; the server validates the attached text and includes it as untrusted source material in the prompt, asking for source/page references.
5. History stores the question, participant answers, and **extracted document text** for reopening and re-running with context. Deleting History deletes its saved snapshot. Closing the tab without running doesn't persist pending files.

## Limits and supported content

- 3 documents per discussion, 8 MiB per document, 120,000 characters combined.
- PDF: up to 75 pages, must have extractable text on **every page**. A scanned-only or partially image-only PDF is rejected with an explanation rather than silently omitting pages.
- DOCX: text extracted via Mammoth and split into labelled sections of up to 6,000 characters. DOCX page numbers are not preserved.
- MD/TXT: UTF-8 text, split into sections.
- OCR, image interpretation, diagram reasoning and visual table interpretation are **not implemented**. Text that represents a diagram may be present in extracted PDF text, but diagrams themselves are not analyzed.
- Sending up to 120,000 characters to model providers can incur substantial token cost; model-specific context windows and other provider limits still apply. Cost meters are estimates and may not be strict external spending limits.

## Security and caveats

- Raw uploaded bytes remain in memory for extraction and are not written to application storage; extracted text is returned to the browser and is saved in private SQLite History on successful runs.
- Extracted document text is transmitted to the AI provider selected for each seat when a discussion runs. Never upload sensitive credentials or personal customer records.
- Saved sessions containing documents **cannot generate public permalink URLs**. Manual JSON or Markdown exports can still contain source text; treat them as sensitive.
- Protected browser access (e.g. Cloudflare Access on the MSI domain) remains a **deployment prerequisite**. The extraction endpoint itself is not an identity provider. Do not expose the Next origin on the internet.
- Inputs are bounded and sanitized; source material is bracketed as untrusted. LLM prompt injection defenses are advisory, not a security guarantee.
- Do not commit `.env.local`, uploaded documents, SQLite databases, logs, credentials, or real user reports to Git.
- A multi-document retrieval index or explicit within-document search has not yet been built; each run includes all extracted text, potentially a large prompt.

## Test evidence (2026-11-14)

- Production Next.js build, TypeScript and selected lint checks pass.
- Full Vitest suite: 47 test files / 601 tests passing.
- Smoke tests on isolated MSI port 3101: PDF per-page extraction, DOCX, Markdown, malformed input rejection, consensus document validation.
- Independent end-to-end model test on port 3101: two seats answered and referenced the source name, saved History, and reloaded extracted text. All operations used fabricated nonconfidential test documents and a separate SQLite database.
- Before releasing, ensure the task's working directory, environment variables, private database path, backup job, Cloudflare access restriction and rollback path are verified.
