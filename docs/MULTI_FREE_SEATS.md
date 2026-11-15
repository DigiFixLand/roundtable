# Multi-family Free Seats on MSI (Nov 15, 2026)

## Automatic local seats, $0 in external API fees

Each of the following is a real local Ollama model on the MSI, configured as a distinct selectable model family for better Seat discovery. These models **all run through Ollama**; the vendor-family labels do **not** imply independent cloud infrastructure or the exact current proprietary hosted model.

| User-facing provider | Model | Runtime | Billing |
|---|---|---|---|
| Ollama (MSI Local) | qwen3:4b-instruct | MSI 127.0.0.1:11434 | $0 API |
| Ollama (MSI Local) | gemma3:4b | MSI 127.0.0.1:11434 | $0 API |
| DeepSeek R1 · MSI via Ollama | deepseek-r1:7b | MSI 127.0.0.1:11434 | $0 API |
| Microsoft Phi-4 Mini · MSI via Ollama | phi4-mini:3.8b | MSI 127.0.0.1:11434 | $0 API |
| Meta Llama 3.2 · MSI via Ollama | llama3.2:3b | MSI 127.0.0.1:11434 | $0 API |

The new **Local free models (5 seats)** preset spreads five personas across distinct local families and both core Ollama models. For small-scale diagnostics, Blind jury (one round) avoids repeated expensive context. GPU memory is 8 GB; model loads may be sequential or share VRAM/CPU and slow down when all five are used. Local inference also consumes electricity and machine resources.

## Requested services that are NOT automatic Seats yet

- **Kimi Web**: Kimi offers consumer web chat but its official API is billed separately. Consumer free memberships are not free programmatic inference. Hosting Kimi's frontier-scale open models exceeds MSI hardware. Do not impersonate Kimi via a different model.
- **NotebookLM**: the official Gemini Notebook API preview supports notebook/source management but does not yet expose a query-answer generation method. A NotebookLM model seat would be misleading. Use the existing manual reference importer until Google supports official chat in API.
- **Hosted DeepSeek Web**: free chat in the website is not the same as the paid API. This release uses the documented **DeepSeek-R1-Distill-Qwen 7B local** family, not the hosted flagship.
- **Other zero-price cloud model APIs**: the configured OpenRouter account has a valid free-tier key and quota, but upstream test calls return errors (including HTTP 429). Do not enable or auto-fallback to a billable variant; investigate upstream before activation.

Sources:
- https://api-docs.deepseek.com/quick_start/pricing/
- https://ollama.com/library/deepseek-r1
- https://www.kimi.ai/help/kimi-api/api-overview
- https://developers.google.com/notebook/docs/roadmap
- https://developers.google.com/notebook/docs
- https://openrouter.ai/collections/free-models

## Safety invariants

- Local model family provider IDs are specifically allowlisted and must target HTTP **127.0.0.1 or localhost** on port **11434**, API path `/v1`. Other addresses are not classified as free local.
- `STRICT_MODELS=true` ensures no unlisted models can run.
- `ROUNDTABLE_ALLOW_PAID_AI=false` is the runtime hard gate blocking paid API calls even if the browser forges its payload.
- Cloud models are not included in this release unless they have demonstrated correct output and verified free billing.
- Pre-existing MSI History SQLite, Cloudflare Access, HUB, ATLAS and SCOUT must be preserved.
- A locally run model family can be selected automatically and participates in each round; external unconnected services are shown as **not connected**, never as voting Seats.

## Release checks

1. Preserve running release and back up SQLite History plus Scheduled Task XML.
2. Build and test in separate Git worktree; full unit/integration tests and staged multi-model end-to-end.
3. Validate five local models each return usable final text and $0 API estimation in staged app.
4. Verify paid model API request returns HTTP 403.
5. Commit source/test/docs only; do not add `.env.local`, actual API keys, History DB or private reports.
6. Switch only RoundTable MSI scheduled task with rollback on failure; verify preserved History, Cloudflare Access, five models and user UI, cost lock.
