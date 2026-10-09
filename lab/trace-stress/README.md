# Hercules Hub TEST — Decision Trace stress harness

This directory is a **QA-only synthetic test**, not an autonomous prescriber or catalog importer. The 2000 profiles originate in the Hercules Drive > Hércules hub > Lab > Decision Trace Laboratory > Import comercial (synthetic fixtures only).

Run: `npm run check:trace-lab`. GitHub main CI also runs this after the original release checks.

The test executes **20,000 scenario evaluations** against the live source implementations of `safetyRouting`, `buildSignals`, `deterministicDelta`, `validateDelta`, `clampDelta`, `applyDelta`, and samples real `makeTrace` SHA-256 records. It does not call external providers, process real clients, modify app state, fetch private files, or change approved training/menu content.

Scenario families: complete evidence, ordinary discomfort, explicit red flag, professional no-exercise, professional other guidance, tracked symptom, low recovery, low sleep, missing check-ins, low adherence. Synthetic demographics and sports are **not** imported into the actual onboarding.

**Unmapped dimensions (must not be claimed supported):** park, pool, court; unsupported sport/goal labels; age and sex are not collected by current ProfileSchema. A separate product decision and full QA are required before expanding onboarding or prescriptions.

The regression guard requires pending owner review never to authorize material progress in the actual deterministic engine, and no restricted training case to progress. The original 28,500-case historic shadow files, media inventory and 66,000 shadow traces stay in the Drive Lab; they are not silently treated as app passes.

Canonicity: EXPERIMENT / QA ONLY. Revisions to health logic require qualified review and deliberate promotion. Rollback: revert the single main commit.
