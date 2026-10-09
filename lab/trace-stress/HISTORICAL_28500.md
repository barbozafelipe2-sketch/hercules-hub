# Hercules Hub TEST — 28,500 historic synthetic cases (QA only)

**Canonical source:** Hercules Drive > Hércules hub > Lab > `lab-cases-unico.csv` (18 batches). Raw CSV SHA-256: `b1b5bb021161483db4ad5204093cd7e8637363c71099523a04ce2fef0096bdc1`.

**Local QA evidence:** 28,500 original rows exercised against the actual v0.14.1 deterministic engine, with 57,000 restricted-safety counterfactual checks, 57 SHA-256 sampled traces, and 28,500 hypothetical adaptation outputs. Composite source+ID keys preserve 1,000 repeated raw IDs. Frozen evaluator-only report: `historical-baseline-v1.json`. TRACK history is absent in these source records: the harness keeps observations UNKNOWN and never fabricates adherence or progress.

**GitHub transfer blocker (unresolved):** The connected repository write action blocked the transfer of the compressed fixture `fixtures/historical-28500.csv.gz`. It is **not committed**, so the GitHub CI does **not** run all 28,500 cases yet. The `check:historical-lab` command is installed but intentionally fails until that exact fixture is present; do not claim it passes in GitHub. The existing `check:trace-lab` CI continues to run 20,000 scenarios plus the independent review-flag regression.

To complete the CI integration: take `lab/trace-stress/fixtures/historical-28500.csv.gz` from the locally QA-verified package `HERCULES_HUB_TESTE_TRACE_LAB_28500_INTEGRACAO_QA_v1.zip`, upload directly to that exact repository path on `main`, run `npm run check:historical-lab`, and only then make it mandatory in CI. Do not change or synthesize a replacement dataset. The source hash is reverified after decompression before evaluation.

**Compatibility:** Only 53 historical rows partially fit core onboarding enums (goal, venue, duration, days). Age, country and sport aren't supported in onboarding. Missing values remain UNKNOWN; no silent coercions or borrowed real-client data. The historical cases do not prove full intake compatibility or clinical correctness.

**Motor correction:** `applyDelta` retains `training.reviewRequired` whenever owner review remains pending. This does not impose a global safety HOLD for ordinary limitations and does not release real clinical restrictions. The review-flag regression is automatically executed by existing CI.

**Status:** EXPERIMENTAL QA only. No approved prescription changes, no new client-facing catalog, no promotion of synthetic tests to production.
