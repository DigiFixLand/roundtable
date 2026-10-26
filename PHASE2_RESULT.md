# DFL RoundTable — Reduced Phase 2 Result

Status: PASS WITH NOTE
Branch: `phase2/reduced-persistence-decision-record`
Phase 1 base: `989a1a5`

## Scope delivered

Only the approved Reduced Phase 2 was implemented:

1. OpenRouter as the primary provider path.
2. Server-side SQLite persistence for completed runs/history.
3. A fixed five-section Chairman Decision Record.

No HUB integration, tool/MCP execution, branding overhaul, extra seats, project/evidence layer, or other Phase 3+ work was added.

## Acceptance results

| Check | Status | Evidence |
|---|---|---|
| SQLite server persistence | PASS | `node:sqlite` database behind `/api/history`; no React component performs SQL |
| History CRUD API | PASS | POST/GET/PATCH/DELETE + clear-all tests |
| Persistence survives server restart | PASS | synthetic run created, server restarted, same run and Decision Record reloaded |
| SQLite excluded from Git | PASS | `/data/*.sqlite` and `/data/*.sqlite-*` ignored |
| Persian / structured snapshot preservation | PASS | SQLite test round-trips Persian text and Decision Record JSON |
| Fixed Decision Record schema | PASS | Consensus, Disagreements, Unique Insights, Recommended Answer / Decision, Uncertainty |
| Dissent preservation / confidence warning | PASS | Chairman prompt explicitly forbids false consensus and treats model confidence as non-objective |
| Legacy snapshots remain readable | PASS | old majority/minority/unresolved judge output maps into the new presentation without rewriting stored evidence |
| Decision Record Markdown export | PASS | all five canonical sections exported; old snapshots retain raw legacy synthesis |
| OpenRouter primary selection | PASS | tested OpenRouter models preferred for Chairman; panel presets rotate OpenRouter first |
| Provider catalog live smoke | PASS | 454 OpenRouter models available; no key material returned to client |
| Real OpenRouter Chairman run | PASS | 2 participants + Chairman completed via `google/gemini-2.5-flash-lite`; 0 error events; structured record present |
| Full test suite | PASS | 44 test files; 593/593 tests |
| Typecheck | PASS | `tsc --noEmit` |
| Lint | PASS | ESLint |
| Production build | PASS | Next.js 15.5.24 with `/api/history` and `/api/history/[id]` routes |
| Diff whitespace validation | PASS | `git diff --check` |

## Architecture notes

- Production History now uses server-side SQLite through API routes.
- `lib/history.ts` remains only as the legacy browser-storage adapter for compatibility and deterministic tests.
- SQLite orchestration lives in `lib/server/history-db.ts`; UI components do not import SQLite.
- The Decision Record is stored in `JudgeResult.decisionRecord`; legacy JudgeResult fields remain as compatibility aliases for old snapshots/permalinks.
- Raw Chairman synthesis remains accessible beneath the structured record for transparency.
- OpenAI direct remains configured as a fallback/validation path; OpenRouter is prioritized for normal selection.

## Known note — OpenRouter cost estimate

The live OpenRouter smoke returned valid token usage, but the selected `google/gemini-2.5-flash-lite` model has no matching entry in RoundTable's local static pricing table, so `estimatedCostUSD` is currently reported as `0`. This must be interpreted as **unpriced/unknown by the local estimator**, not proof that the API call was free. The OpenRouter key-level credit limit remains the hard spend guard for this phase. No current provider pricing was hard-coded as part of this scope.

## Cleanup / safety

- The synthetic restart-smoke history row was deleted after verification.
- No API key is stored in tracked project files.
- `.env.local` remains local and gitignored.
- Production server should be stopped after final validation.
