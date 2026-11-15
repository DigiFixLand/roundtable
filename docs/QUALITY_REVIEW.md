# Quality & Evidence Review — RoundTable (2026-11-15)

This change addresses practical failures found in a real HUB architecture comparison: missing final answers, repetitive output loops, model confidence misrepresented as consensus, incomplete Chairman decisions, and excessive prior-round context for smaller free local models.

## Controls

1. **Quality Gate on each final model answer**: checks for no substantive answer, hidden-reasoning-only output and repetitive word/line loops. Severely invalid output is displayed with an explicit "Quality Gate rejected" reason, excluded from vote scoring, subsequent debate context and Chairman synthesis. Short responses, absent page citations and unsubstantiated hardware figures are cautions (not automatically proven false).
2. **Evidence limitations**: local long-document answers use selected excerpts (not complete document review). The brief says **PARTIAL DOCUMENT REVIEW**. Page labels and numeric/hardware claims are checked against the excerpts heuristically, with visible warnings. Citation-presence is not evidence verification; primary sources and operational tests remain authoritative.
3. **Three-round decision review**: a one-click setup in Protocol enables CVP with blind round one, cross-examination round two, revised positions round three, no early stop, local-only/free-only, a local Chairman and a contradiction-extractor pass. The default lightweight Blind Jury protocol remains available. This may use more CPU time, electricity and local RAM.
4. **Bounded prior context**: invalid answers excluded, earlier answers explicitly labeled as truncated when supplied to later rounds/Chairman. The selected evidence budget is balanced across pages rather than concentrating exclusively on one page.
5. **Chairman result must earn its label**: requires all five sections (Consensus, Disagreements, Unique Insights, Recommended Answer/Decision and Uncertainty), two valid independent model variants, an accountable owner, acceptance test and rollback/stop condition. A missing requirement means **DECISION PENDING**, not a false "approved" recommendation. Original generated text remains inspectable for transparency.
6. **Correct score semantics**: the old "Consensus score" label implied substantive agreement. It is now **Confidence alignment (not factual consensus)**, still using the historical formula; old saved scores are preserved numerically. Factual agreement needs source review, not a self-reported confidence number.
7. **Claim extraction fails visibly** if the model provides no parseable structured JSON or invented/unverifiable quotes; an empty list does not prove that no real contradictions exist.

## Limitations

- Heuristics cannot reliably decide if arbitrary engineering claims are true, cannot validate that a citation semantically supports an assertion, and cannot read PDF diagrams or scanned-only pages.
- Source excerpts are selected lexically. For a 12-page report the run still reviews only some of the pages unless the source is shorter than the model context budget; this is clearly disclosed.
- A multi-round discussion is not the same as independently verified facts. Humans and source-of-truth system checks must approve production changes. A Chairman "structured" status is **format compliance**, not factual certification.
- Distinct personas from the same model should not be counted as distinct independent models. This release checks unique model IDs in the final Judge gate.
- Local-only and paid-API lock remain the server default. Cloud integrations and unrelated HUB/ATLAS/SCOUT remain untouched.

## Validation checklist

- Unit and UI tests: new quality tests, repeated output rejection, invalid Chairman detection, three-round debate and bounded context.
- Full Vitest suite, lint, optimized production build.
- Isolated MSI stage on port 3107 using a dedicated SQLite database, not live History.
- Synthetic HUB-like document with two distinct free local models (Qwen Instruct and Gemma 3) over three rounds + Chairman + claim extraction.
- Paid API request must return HTTP 403.
- Before MSI production task cutover: back up active SQLite and scheduled-task XML, verify integrity and prior History count. Roll back on health failure.
- After production cutover: verify 5 existing local models, exact History count, new setup CTA, confidence-alignment UI and cost guard; repeat a brief local test.

## Previously observed stage example

A synthetic report with two models completed three CVP rounds, a structured Chairman record and claim extraction in about 106 seconds. Both models completed all six turns, the paid-API negative test returned HTTP 403, and API cost was recorded as $0. This test does not by itself prove the overall quality of architecture advice.
