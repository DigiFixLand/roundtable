# RoundTable Decision Audit (Free-first, 2026-11-15)

## Why

The prior free-model HUB discussion produced outputs that were too weak for
production engineering decisions. In particular Qwen failed with >4096 context,
a chairman invented named owners and deadlines, and a 50/100 confidence score
was mistaken for substantive consensus.

## New operational workflow

- Keep existing Debate/Blind jury/Red team experiments available.
- Use **Decision Audit — recommended for engineering decisions** on Setup.
- Attach the ORIGINAL report (PDF/DOCX/TXT/MD) as primary evidence. Optionally
  paste another AI's proposal (e.g. Claude, Kimi) into "Manual AI answers" as an
  **unverified suggestion**. It is never a third independent vote.
- Click **Configure Decision Audit (2 local models)**. This strictly chooses
  Qwen3 4B Instruct (architecture/evidence reviewer) + Gemma3 4B (risk challenger),
  3 CVP rounds, Gemma Chairman, no paid/cloud requests or separate LLM claims pass.
- The server validates that exact combination and requires a primary document;
  a crafted request cannot replace the seats with a paid provider or quietly
  change the engine.
- Result Brief shows **Decision Audit — human review required** with mechanical
  source-screen findings; Export offers **Decision Audit Report** in Markdown.
  The operational draft includes alternatives, risks, proposed steps, acceptance,
  rollback and unresolved verification, and **never** creates production tasks.

## Context manager

- Every local model and the local Chairman/claims pass is subject to conservative
  preflight prompt budgeting for the default 4096-token Ollama context.
- The budget is not a true Qwen/Gemma tokenizer; it intentionally preserves
  headroom for wrappers and output. It trims the middle of very long inputs with
  an explicit "PARTIAL CONTEXT" marker and visible Quality caution. It **does not**
  claim to have reviewed the full PDF.
- Response budget for local participants is 800 tokens, Chairman 950 tokens,
  claims extractor 700 tokens. Longer analyses may need staged document review
  or a larger, explicitly configured context after capacity testing.

## Source evidence validator

- Inspects actual extracted primary source page numbers.
- Flags references to missing pages, missing page citations, unsupported
  percentages/hardware/recovery times, suspicious named Owners, long quoted
  passages absent from the source, and obvious conflicting architecture
  choices among valid panel replies.
- This is **NOT** semantic entailment verification: citation presence does not
  prove that a claim is supported. Proposed target metrics may be flagged even
  if they are sensible new goals.
- If critical findings exist, the Chairman becomes **Decision Pending**. The
  raw draft text remains available for review and export, but no deployment is
  authorized under any outcome.

## Validation evidence

- 57+ files / 638+ existing and new tests green before final UI acceptance.
- First real isolated stage test used the **original 2399-character HUB question
  and 12-page, 27,411-character report** from existing private MSI History.
- Qwen + Gemma completed six responses over 3 rounds, local Chairman completed,
  zero context-overflow errors, $0 API cost and about 73s elapsed.
- Chairman source check correctly marked decision **PENDING** on the absence of
  source page references, rather than treating format compliance as proof.
- Stage uses separate SQLite database. This report is source code only and
  excludes the private HUB PDF, extracted source, model answers, tokens and
  secret keys.

## Remaining work

- True tokenizer per model with measured Ollama context configuration.
- Semantic source entailment review and reliable extraction from scanned PDFs
  or images, not merely page-presence heuristics.
- Optional externally hosted high-quality models under explicit price/privacy
  consent, never automatic paid fallback.
- Benchmark against independent human review and operational tests; any
  production architecture change remains owner-approved NO-GO until verified.

## Safe deployment process

Run full automated suite, optimized Next build and real stage. Commit code/test
only. Back up MSI SQLite History and Windows Scheduled Task XML. Switch only
the RoundTable MSI task using rollback, verify 5 local models, the 5 prior
History entries, Decision Audit UI, Cloudflare Access and paid API hard gate.
