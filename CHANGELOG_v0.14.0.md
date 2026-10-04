# Hercules Hub v0.14.0 — final pre-commit candidate

- Removed the user-facing login/logout concept; replaced it with automatic device sessions.
- First launch is language/onboarding; returning users open directly to Home.
- Added Month 2/3/4/... evidence-driven adaptation with deterministic safety bounds.
- Added adaptive meal/exercise catalog candidates when the bundled release lacks needed coverage.
- Added Decision Trace Lab v2 with input/output fingerprints and provider/catalog provenance.
- Added Netlify AI Gateway-first routing with direct-provider calls disabled by default.
- Added provider attempt timeouts and bounded fallback behavior.
- Added Export Monthly Report PDF with embedded integrity-checked recovery payload.
- Added Restore Progress from a Hercules PDF after browser-data loss/device changes.
- Preserved the official Hercules logos and brand assets after the temporary logo-removal misunderstanding.
- Kept Google Drive as the master/editorial asset library without a live runtime dependency.
- Updated service-worker cache/versioning and mobile/PWA polish.
- Replaced stale release checks with a v0.14.0 release audit gate.
- Restored and verified official Hercules branding in onboarding and the top app bar; added PWA/app icon metadata.
- Fixed reserved TypeScript generic-arrow syntax in `catalog-lib.mts` and added a regression check.
- Removed obsolete pre-v0.14 audit/test machinery and stale release reports from the new canonical repo.
- Added a hash-verified chunked asset bundle so the canonical GitHub repo remains connector-safe while a clean Netlify build reconstructs the exact optimized local image library before QA/publish.
