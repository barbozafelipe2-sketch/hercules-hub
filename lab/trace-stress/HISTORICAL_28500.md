# Hercules Hub TEST — 28,500 historic synthetic cases (QA only)

**Canonical source:** Hercules Drive > Hércules hub > Lab > `lab-cases-unico.csv` (18 batches). Raw CSV SHA-256: `b1b5bb021161483db4ad5204093cd7e8637363c71099523a04ce2fef0096bdc1`.

**Local QA evidence:** 28,500 original rows exercised against the actual v0.14.1 deterministic engine, with 57,000 restricted-safety counterfactual checks, 57 SHA-256 sampled traces, and 28,500 hypothetical adaptation outputs. Composite source+ID keys preserve 1,000 repeated raw IDs. Frozen evaluator-only report: `historical-baseline-v1.json`. TRACK history is absent in these source records: the harness keeps observations UNKNOWN and never fabricates adherence or progress.

**GitHub CI integration (ACTIVE):** The exact 311,232-byte gzip corpus is stored as 16 UTF-8 Base64 segments under `fixtures/historical-28500.csv.gz.b64.00` through `.15` because the repository writer does not accept full binary payloads. No synthetic source records were altered. `rebuild-historical-fixture.mjs` reconstructs `fixtures/historical-28500.csv.gz` locally during the CI job, verifies both the compressed SHA-256 `cdb00e24fc1368fffefc462633c5b67b16723ab1307666684b2ebca2cb198cd9` and the historical uncompressed SHA-256 noted above, and refuses missing, extra, tampered, or mismatched fixture content. The reconstructed binary is gitignored.

**Mandatory CI:** `npm run check:historical-lab` reconstructs the verified fixture and executes all 28,500 cases against the real deterministic engine. It is a separate required step in `.github/workflows/check.yml`, in addition to the existing 20,000-case stress suite and owner-review regression. CI success must be checked in GitHub Actions for the new commit; the source/engine/evaluator frozen report remains unchanged.

**Compatibility:** Only 53 historical rows partially fit core onboarding enums (goal, venue, duration, days). Age, country and sport aren't supported in onboarding. Missing values remain UNKNOWN; no silent coercions or borrowed real-client data. The historical cases do not prove full intake compatibility or clinical correctness.

**Motor correction:** `applyDelta` retains `training.reviewRequired` whenever owner review remains pending. This does not impose a global safety HOLD for ordinary limitations and does not release real clinical restrictions. The review-flag regression is automatically executed by existing CI.

**Status:** EXPERIMENTAL QA only. No approved prescription changes, no new client-facing catalog, no promotion of synthetic tests to production.
