# Hercules Hub v0.14.1

Hercules Hub is a device-first adaptive fitness, nutrition, recovery and progress system for Netlify. There is no user-facing login/password flow: first launch goes to language/onboarding, creates Month 1, then returns directly to Home on later launches.

## Plan creation and long-term adaptation
Month 1 is built from onboarding using deterministic safety/personalization rules plus the bundled Hercules exercise and meal catalog. Ordinary pain/limitation routes to conservative plan shaping plus owner review notification rather than a blanket plan stop; controlling no-exercise guidance and safety-critical red flags still restrict affected TRAIN prescription. The catalog is a preferred starting point, not a ceiling. When coverage is insufficient and Netlify AI Gateway is available, Hercules can create validated meal definitions and conservative exercise variations, record their provenance, and carry them forward in the adaptive catalog.

Months 2, 3, 4 and later are generated from explicit cycle evidence: completed sessions, daily check-ins, baseline/checkpoint/final marks, energy/sleep/training/nutrition feedback and safety flags. The deterministic engine sets the maximum allowed adaptation; AI reviewers may make the change more conservative but cannot override safety holds or make the program more aggressive than the validated evidence permits.

## Google Drive asset library
Google Drive is the master/editorial library for Hercules assets. Production does **not** fetch Drive at runtime. The deploy ships a curated, versioned catalog under `public/assets/`, fingerprinted by `public/assets/asset-manifest.json`, so the app remains fast and functional if Drive permissions, names or availability change. To keep GitHub source readable while avoiding dozens of binary-file mutations, the release stores the verified archive as small text chunks under `asset-bundle-v0.14.0/`; `npm run prepare:assets` reconstructs the archive, verifies its SHA-256, and expands it before verification/build.

The current master Drive folders are organized as Exercises, Meals, Logo, Avatar and System. The PWA best-effort precaches the curated release asset manifest for stronger offline resilience; API/AI features still require network access. Runtime-generated meal definitions with no approved image are explicitly marked as needing a new visual asset rather than silently pretending the placeholder is an approved food photo. Additions can be curated into future release catalogs without making Drive a live dependency. Git stores the curated release as versioned base64 chunks of the compressed asset bundle; the verified Netlify build reconstructs and expands it into `public/assets/` before QA and publish.

## Netlify AI Gateway
All AI calls run server-side in Netlify Functions. Hercules reads Netlify's automatically injected provider keys and base URLs for OpenAI, Gemini, Anthropic and OpenRouter, with direct-provider routing disabled by default. On a credit-based Netlify plan, this avoids maintaining separate provider accounts/credit balances; AI usage consumes Netlify credits.

Provider attempts have hard timeouts and a bounded fallback budget. If AI review is unavailable, validated non-safety adaptation can fall back to deterministic logic; explicit safety holds and AI rejections still prevent automatic progression.

## Decision Trace Lab
Initial generation and each later-cycle adaptation produce `hercules-trace-v2` records with SHA-256 input/output fingerprints, deterministic gate data, catalog provenance, provider/model/route/verdict metadata and final authority. Raw prompts and raw profile payloads are not copied into Trace Lab.

## Monthly report and recovery
Settings includes **Export Monthly Report**. The PDF contains the readable monthly summary plus an embedded, integrity-checked Hercules recovery payload. After reinstalling, changing devices or clearing browser data, **Restore Progress** can read the latest Hercules PDF and reconstruct the profile, plan, current month, progress history, adaptive catalog and trace state. Treat exported reports as private because they contain profile/progress data.

## Persistence and security
A device-scoped signed HttpOnly session is created automatically; users do not enter credentials. Local storage provides on-device continuity. Optional Supabase persistence stores an authoritative copy under a server-side device owner key. Provider credentials and Supabase secrets remain server-only. Requests are bounded, validated with Zod and rate-limited.

## Verify
```bash
npm run prepare:assets
npm run check
npm run check:syntax
```

Deployment: `DEPLOY_NETLIFY.md`  
Architecture: `SYSTEM_ARCHITECTURE_v0.14.1.md`  
Release changes: `CHANGELOG_v0.14.1.md`

## Repository hygiene
This repository contains the current release only. Obsolete pre-v0.14 audit scripts and stale reports were removed so future verification cannot accidentally run against the retired login/password architecture.


## Family & friends beta scope

v0.14.1 is intentionally device-first for controlled family/friends testing. It does not include commercial login, Stripe billing or account recovery. Those belong in the later production repository. This beta hardening keeps month advancement server-approved when persistence is enabled, enforces common free-text dietary patterns in deterministic menu selection, improves mobile legibility and reports per-cycle Trace Lab generation counts.
