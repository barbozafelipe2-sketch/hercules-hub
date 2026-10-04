# Hercules Hub — System Architecture v0.14.1

## Product flow
`First launch -> language -> onboarding -> Month 1 generation -> Home -> daily use -> Month review -> Month N+1 adaptation`.

There is no user-facing login/password or logout flow. A signed, HttpOnly device session exists only to protect server endpoints and optional persistence.

## Plan authority
1. Onboarding/profile data defines goals, schedule, location, experience, meal frequency/preferences, recovery context and safety flags.
2. Deterministic rules create the allowed Month 1 structure and controlling safety gates.
3. The bundled catalog supplies preferred exercise/meal assets.
4. Netlify AI Gateway may audit the plan and create bounded catalog candidates when the bundled catalog lacks coverage.
5. Deterministic safety rules always outrank model output.

## Multi-cycle adaptation
Each later month is rebuilt from validated evidence rather than copied blindly. Inputs include completed sessions, deduplicated daily check-ins, baseline/checkpoint/final marks, explicit symptoms and prior cycle state. The deterministic delta caps how aggressive an adaptation may be. AI candidates can only stay within or become more conservative than that cap.

Routine non-safety adaptation may use a deterministic validated fallback when Gateway reviewers are unavailable. Safety holds, explicit concerning symptoms or explicit AI rejection require review and cannot auto-progress.

## Adaptive catalog
Google Drive is the master/editorial library, not a runtime dependency. The deployed release uses `public/assets/asset-manifest.json` and bundled assets first. The server can add schema-validated `GEN-MEAL-*` and `GEN-EX-*` entries when a plan needs coverage or purposeful variation. Common free-text dietary patterns are deterministically filtered before bundled or generated meals can be selected. Generated entries are carried forward with provenance and appear in Trace Lab.

## Decision Trace Lab
`hercules-trace-v2` stores hashes, deterministic gates, reviewer route/model/verdict metadata, catalog provenance and the final decision. It intentionally excludes raw prompts and raw profile payloads.

## Persistence and recovery
Local storage is the device continuity layer. Optional Supabase persistence is keyed by a hashed device subject and written only by server-side Functions using a secret key. Ordinary state saves cannot advance the month; `/api/next-cycle` stages an approved transition server-side and the dedicated activation action advances the persistent cycle. Monthly PDF export embeds an integrity-checked `hercules-backup-v1` payload; Restore Progress validates it server-side before applying it.

## Netlify AI Gateway
Provider REST calls honor Netlify-injected `*_API_KEY` and `*_BASE_URL` variables. Direct provider routing is disabled by default. Provider attempts and fallback chains are time-bounded so one failing model cannot stall the product indefinitely.

## Security boundaries
- provider/Supabase secrets never enter browser code;
- Zod validates all profile, plan, state, restore, trace and adaptive-catalog payloads;
- request bodies are size-bounded;
- AI/state endpoints are rate-limited and AI operations have daily quotas;
- signed sessions use HttpOnly + SameSite=Lax cookies;
- CSP blocks third-party script/connect sources;
- safety gates cannot be model-released.


## Release asset transport
The curated runtime asset catalog is stored in Git as base64 chunks under `asset-bundle-v0.14.0/`. `scripts/prepare-assets.mjs` reconstructs the compressed bundle, verifies SHA-256 `84548c65c9d996ca50b80c9d4752a63832cf69f58c56ddb0b0579f4bd1d9682b`, and extracts `public/assets/` before the release gate. Google Drive remains editorial/master storage and is not a runtime dependency.
