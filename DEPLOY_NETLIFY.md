# Netlify deployment — Hercules Hub v0.14.1

Deploy the complete repository. `public/` is the static/PWA UI; device sessions, persistent state, AI review, Coach, restore and next-cycle logic run through Netlify Functions.

## 1. Netlify AI Gateway — recommended
Use a credit-based Netlify plan and make at least one production deploy so AI Gateway activates. If you want Netlify-managed inference, do **not** create your own provider key/base-URL variables for OpenAI, Gemini, Anthropic or OpenRouter. Netlify injects the provider keys and custom base URLs into Functions automatically.

Optional model overrides:
- `OPENAI_MODEL` (default `gpt-5.6-luna`)
- `GEMINI_MODEL` (default `gemini-3.7-flash`)
- `ANTHROPIC_MODEL` (default `claude-haiku-4-5`)
- `OPENROUTER_MODEL` (default `openrouter/auto`)

Keep `HERCULES_ALLOW_DIRECT_AI=false` unless you deliberately want to use your own provider account. AI Gateway avoids separate provider balances but still consumes Netlify credits.

## 2. Participant database — Phase 1
`@netlify/database` provisions PostgreSQL from the SQL files in `netlify/database/migrations/`. The test site's `production` database branch is provisioned and the core migration is applied. Keep these migrations additive; an applied migration file is immutable.

The schema provides accounts, permanent profiles, sessions, onboarding versions, plans, meals, exercises, progress, reviews, blocks, monthly history, and audit events. The current app still uses its legacy device identity and optional Supabase state sync; do not treat the new tables as the active participant store until account authentication, scoped repositories, encryption, and restore procedures are connected.

Participant payload encryption uses AES-256-GCM. In Netlify, set `HERCULES_DATA_ENCRYPTION_CURRENT_VERSION=1` and create `HERCULES_DATA_ENCRYPTION_KEY_V1` as a secret with the Functions scope across all deploy contexts. The key must decode from base64url to exactly 32 bytes. `.env.example` contains names only. Never commit real key values. Keep every old version available for decryption until all rows using it have been re-encrypted and verified. No participant records are currently encrypted with this key.

After changing either encryption variable, trigger a new deploy before relying on the setting; confirm that `/api/status` reports both `dataEncryption: true` and `participantStorageReady: true`.

`/api/status` reports booleans for `netlifyDatabase`, `dataEncryption`, and `participantStorageReady`; it never returns secret values. Run `npm run check:db` to verify the local migration, tenant constraints, and encryption behavior.

## 3. Legacy device persistence
No login/password configuration is required for the current legacy flow. Hercules automatically creates a signed device session. This is not cross-device account authentication.

For optional authoritative server persistence, apply `supabase/migrations/20260909_hercules_user_state.sql` and set server-side:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Also set a strong `HERCULES_SESSION_SECRET` where practical. If omitted, Hercules can derive a stable secret from the Supabase secret or Netlify Blobs.

## 4. Runtime assets
No Google Drive connection is required at runtime. Exercise, home-workout, food and official brand assets are stored as versioned text chunks under `asset-bundle-v0.14.0/`; Netlify runs `npm run build`, reconstructs the compressed bundle, verifies its SHA-256, expands it into `public/assets/`, then executes the full release gate. `asset-manifest.json` fingerprints the curated release. Drive remains the master/editorial library.

## 5. Smoke test before deployment
Run `npm run check` and `npm run check:db` (the first prepares the verified asset bundle automatically). After deployment verify:
- first launch opens language/onboarding with no login screen;
- Month 1 generation reaches Home;
- official Hercules logos render in light/dark UI;
- TRAIN, NOURISH, RECOVER, MIND, TRACK and EVOLVE render without console errors;
- Settings has Export Monthly Report and Restore Progress, and no Logout/Sign out control;
- the exported PDF can restore progress on a clean browser profile;
- Settings reports Netlify AI Gateway after activation;
- `/api/status` reports `netlifyDatabase: true` and `participantStorageReady: true` before enabling participant writes;
- adaptive catalog candidates are traced when created;
- Month 2+ remains locked until 28 days + final training week + Final Mark;
- symptom/safety HOLD cannot be auto-released;
- the service worker updates to the current `hercules-hub-v0.14.1` cache.

## 6. Rollback
Revert/redeploy the parent application commit. The Supabase and Netlify database migrations are additive; an application rollback does not reverse them. Do not delete user state during rollback. A user can also restore from their latest Hercules PDF if local browser data is lost.

## Beta EXTRA / snapshot update
After deployment test all three onboarding languages, the optional sport selection and specific days, EXTRA for training / sports / rest days, clickable guides and completion, PDF export at Day 0 before Final Mark, and restore that PDF on a clean device. Do not confuse snapshot export with the unchanged 28-day next-cycle requirement.
