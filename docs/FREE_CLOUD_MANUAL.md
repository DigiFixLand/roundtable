# RoundTable: free cloud and manual AI inputs

## Purpose

The goal is to combine local AI capacity with genuinely free cloud endpoints and manual pasted AI research. This does not give websites such as Kimi, DeepSeek Chat, or NotebookLM an automated API connection.

## Cloud free endpoint

- Optional configured provider: **OpenRouter (free models only)**.
- Exact base URL: `https://openrouter.ai/api/v1`
- One allowlisted routing ID in the pilot: `openrouter/free`. OpenRouter selects an available free model each time; the underlying model can vary. The previously tested explicit `meta-llama/llama-3.3-70b-instruct:free` endpoint returned 'free version unavailable' during a live test and was **not** switched to the paid version.
- The already configured `OPENROUTER_API_KEY` is referenced using `env:OPENROUTER_API_KEY` and never stored in source control.
- **Default is still Local only / Free only**. To run this model, the user changes privacy to **Allow free cloud AI** (or **Ask before cloud use** and explicitly confirms).
- The model is classified as free only if its server-side provider ID, HTTPS host/path and billing-tier declaration match **and** the requested ID is exactly `openrouter/free` or an explicit `:free` model ID. The paid `openrouter/auto` routing ID is never treated as free. Everything else is paid/unapproved.
- `STRICT_MODELS=true` disallows arbitrary unlisted models even when a browser supplies a crafted model ID. `ROUNDTABLE_ALLOW_PAID_AI=false` is a separate server-side hard gate.
- Free-model requests never auto-fallback to paid models. Provider 429 or 401 errors are shown as failures.
- OpenRouter's documented default free variant quotas are **50 requests/day and 20/minute** for accounts without qualifying credit purchases; failed calls can count. Rate limits depend on account status and upstream providers.
- OpenRouter documents the `openrouter/free` router as selecting exclusively free models with $0 input/output pricing. Availability, underlying quality and rate limits still vary. Never substitute the paid `openrouter/auto` router.

Official docs:

- https://openrouter.ai/collections/free-models/
- https://openrouter.ai/meta-llama/llama-3.3-70b-instruct:free
- https://openrouter.ai/pricing

## Manual AI answers

- In Setup, choose **Manual AI answers — no API needed**.
- Click **Copy question**, visit Kimi, DeepSeek Chat, NotebookLM or another website.
- When discussing an uploaded source, add that source to the external website yourself before asking for its review. RoundTable does not transfer the source file to these websites.
- Paste the website response (max 12,000 characters each) and select its source. Click **Attach manual answer**.
- Such responses become local text attachments labelled **unverified manual AI answer**, and are included as reference material for the local/selected cloud panel. **They are not independent voting seats**, and no claim is made that the external website ran through our API.
- The private History snapshot and downloadable JSON contain attached answer text; Markdown export includes the pasted answer and provenance.
- To reduce the chance of external AI claims swamping primary evidence, long-document local mode reserves at least the majority of its excerpt budget for primary source documents and clearly identifies unverified external suggestions.
- Private document sessions do not allow public share permalinks. Copying/pasting is user-controlled.

## Boundaries

- Total document/answer attachments per session: 6; combined extracted text maximum 120k characters. Originals are not saved, but extracted text is stored in private History on run.
- Free cloud models will receive selected question and extracted document text on explicit cloud-enabled runs; this may include pasted external answers. Free provider data handling differs from local processing.
- Kimi/DeepSeek Chat/NotebookLM APIs or browser automation are NOT implemented. Browser automation must not be described as implemented.
- Groq and Gemini are not classified as guaranteed-free by a casual provider ID. Their pricing and account tiers must be separately configured and verified before adding these providers.
- A free-tier API key with an exhausted quota does not grant free unlimited access.

## Rollout checklist

1. Complete unit / integration test suite and optimized Next.js build in a separate worktree.
2. Test local model and free-only cloud model on isolated stage port with a fabricated question, without sensitive documents.
3. Confirm paid OpenAI requests return HTTP 403, including a forged paid opt-in; confirm strict model ID validation.
4. Back up the live SQLite History database and Scheduled Task XML; verify the backup's integrity.
5. Point release .env.local to the _existing_ MSI production History DB; keep the paid gate false.
6. Switch only MSI RoundTable scheduled task, not Hostinger, HUB or other services, and check UI, /api/providers and History count.
7. Re-run local and cloud test on the protected live origin; roll back on failure. Never disclose API keys or other secrets in logs.

## Pilot results, 2026-11-15

- 53 test files / 618 tests passed. Optimized Next.js build passed.
- Local-only synthetic source + manually imported Kimi response + Qwen Instruct and Gemma: 2/2 nonempty answers, 0 model errors, $0 API (about 4 seconds).
- The free OpenRouter key reference exists on MSI, but three representative free endpoint attempts were not usable in live testing: an old explicit Llama :free model was reported unavailable; the random free router yielded no final text; a currently listed Gemma :free model returned a provider error. No paid substitution occurred.
- Accordingly, the **production UI must keep OpenRouter free disabled/unconfigured** until an account-level diagnosis and a successful live smoke test. This feature branch contains optional provider-routing code but does not claim a functional free cloud integration today.
- Kimi, DeepSeek Chat and NotebookLM are manual user-paste reference sources only, not automated providers or independent RoundTable voters.
