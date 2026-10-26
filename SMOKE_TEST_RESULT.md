# DFL RoundTable — Smoke Test Result

Status: PASS — Phase 1 `FORK_AND_SMOKE_TEST` complete
Branch: `phase1/fork-smoke-test`
Baseline: `378b5d01889682b130813bc28f6ac1584f5b5b02`

| Check | Status | Note |
|---|---|---|
| DFL-owned fork created | PASS | `DigiFixLand/roundtable` |
| Upstream attribution | PASS | `UPSTREAM.md`, MIT license retained |
| Clean install | PASS | pnpm 10.33.0, frozen lockfile |
| Tests | PASS | 40/40 files; 580/580 tests |
| Typecheck | PASS | `tsc --noEmit` |
| Lint | PASS | ESLint |
| Production build | PASS | Next.js 15.5.24 |
| Explicit loopback bind | PASS | listener `127.0.0.1:3000` |
| Local HTTP reachability | PASS | HTTP 200 |
| LAN unreachable | PASS | MSI `192.168.1.138` could not connect to HUB `192.168.1.77:3000` |
| Firewall checked | PASS WITH NOTE | Two enabled inbound Node.js allow rules exist for Private/Public; loopback-only listener prevented exposure |
| OpenRouter model listing | PASS | 454 OpenRouter models returned through `/api/providers`; no API-key leak |
| OpenRouter completion | PASS | `openrouter:google/gemini-2.5-flash-lite` completed successfully |
| Direct-provider completion | PASS | direct OpenAI `openai:gpt-4.1-mini` completed successfully |
| Wrong-key isolation | PASS | process-local invalid OpenRouter key caused only OpenRouter participant failure; direct OpenAI still completed successfully |
| Cost/usage sanity | PASS WITH NOTE | direct OpenAI returned 148 tokens and nonzero estimated cost; OpenRouter returned 140 tokens, but local estimator reported `$0` for the selected routed model |
| Persian input/output | PASS | real OpenAI run returned Persian correctly |
| Mixed RTL/LTR | PASS | `dir="auto"` added to prose/input/history text; Markdown code/pre remain `dir="ltr"` |
| History | PASS | Persian/mixed RTL-LTR preservation covered by regression test |
| Export | PASS | Persian/mixed RTL-LTR preservation verified in Markdown and JSON export tests |

## Smoke-only code changes

- Added automatic bidi direction for question input, rendered model prose, history titles and notes.
- Forced Markdown code/pre blocks to LTR.
- Added regression coverage for Persian/mixed RTL-LTR input, history, Markdown rendering, and Markdown/JSON export.

## Security / scope notes

- `.env.local` remains gitignored and untracked.
- No API key is present in client provider responses.
- Wrong-key test used only a process-local intentionally invalid OpenRouter value; the real local key was not modified.
- No SQLite, Decision Record implementation, tools/MCP/HUB integration, branding, or other post-Phase-1 scope was started.

## Result

The approved `FORK_AND_SMOKE_TEST` gate is complete and passes. Per the handoff scope cap, stop here before reduced Phase 2 (`OpenRouter + SQLite persistence + Decision Record`) unless that next phase is explicitly authorized.