# RoundTable Free-First Routing

This feature makes **local inference the default** and prevents unapproved paid API calls. It is separate from HUB/SCOUT/ATLAS deployment.

## Default configuration

- Free-first: `privacyMode: local-only`, `costMode: free-only`.
- Debate protocol: `blind-jury` (one round); claim extraction off.
- "Free-first (2 seats)" preset pairs First-Principles Engineer and Risk Analyst.
- A document can be attached separately from the 10,000-character question.
- Local-first inference uses an Ollama **OpenAI-compatible** endpoint bound to loopback on the application host.
- Each local model is a distinct seat; two seats can be served by one model with two different personas, but model diversity is better.

## Model classifications

Classifications are generated on the server and cannot be supplied by browser model metadata:

- **local:** `ollama` with `http://127.0.0.1:11434/v1` or localhost and a model name without cloud marker.
- **free-cloud:** a specifically configured `gemini-free`, `groq-free`, or `openrouter-free` provider with `billingTier: free`; OpenRouter also requires a `:free` model suffix. _This class is an operator declaration of the chosen provider/account's eligibility, not an independent guarantee about third-party billing._
- **paid-cloud:** anything else or unknown.

Every requested participant and the optional Judge are validated _server-side before_ any AI call. Paid models need all of `costMode: paid-allowed`, `paidApproved: true`, and the server setting `ROUNDTABLE_ALLOW_PAID_AI=true`. Deployment leaves this setting **false**. Cloud use under `ask-before-sharing` requires a fresh run approval.

No eligible free-cloud provider is provisioned by default. Do not imply Kimi, DeepSeek's hosted chat, or NotebookLM are connected to this release. They remain candidates for a future official API or manual-import workflow.

## Document handling and cost estimates

- For **all-local runs**, the server selects at most approximately 6,000 source-text characters relevant to the question from large documents. Text is tagged with filename and PDF page (or section). A warning explicitly identifies the excerpts as **partial evidence**. This is simple keyword retrieval, not embeddings, OCR or full-document review.
- For allowed cloud runs, the original full extracted document text is supplied with source labels; this may exceed a model's context limit.
- The estimate now includes attachment length, uses the local excerpt budget for all-local runs, and marks verified local/free cloud calls as $0 **API**. Local hardware, time, electricity and internet costs remain.
- Judge and claims estimates inherit their actual model access class when it is known; unknown remains unpriced, never falsely verified free.
- The budget/cost-cap is informational and best-effort; the reliable non-billing gate is the server-enforced paid lock.

## MSI runtime

- Windows MSI hosts protected Next.js RoundTable; its Scheduled Task points to the current release worktree.
- Ollama listens on `127.0.0.1:11434`, not a LAN-exposed address; the Windows startup item starts Ollama after user sign-in.
- Offered local models: `qwen3:4b-instruct` and `gemma3:4b` (check install before enabling). The older `qwen3:4b` thinking-only tag is intentionally **not exposed** because its OpenAI-compatible responses can exhaust tokens in the reasoning field and return empty final content.
- `.env.local`, API keys, and SQLite History are ignored by Git and never committed. Local History contains extracted source text.

## Evidence (Nov 15, 2026)

- Optimized build: PASS; TypeScript: PASS.
- Full post-fix suite: **614/614** passed (52 files) with test timeout 15 seconds. Empty-final-answer regression tests: passed. Optimized Next.js build and TypeScript: passed.
- Live isolated model call: one-seat Gemma completed with `estimatedCostUSD=0`.
- Live isolated two-seat + synthetic document test using **Qwen3 4B Instruct + Gemma 3 4B**: two nonempty responses, 0 errors, `estimatedCostUSD=0` for each (about 4 seconds). Original `qwen3:4b` Thinking tag was not reliable over the OpenAI-compatible endpoint; an explicit visible error guard was added and the exposed model changed to Instruct.
- Three attempts to call paid OpenAI models through isolated RoundTable routes were rejected with HTTP **403**, including a forged paid opt-in with server paid gate off.

## Operational checks and rollback

Before switching a scheduled service, create a verified SQLite backup and export the existing Scheduled Task XML. Ensure the new worktree has a built artifact, Ollama available on loopback, and an identical **existing production SQLite path**. Switch the task to the new worktree, check the main HTML, `/api/providers`, `/api/history` count, paid HTTP 403, and a local inference call. On failure, restore the prior task action and restart.

Do not merge or deploy to unrelated Hostinger or HUB production environments as part of this MSI-only rollout.
