# Netlify deployment — Hercules Hub v0.14.0

Deploy the complete repository. `public/` is the static/PWA UI; device sessions, persistent state, AI review, Coach, restore and next-cycle logic run through Netlify Functions.

## 1. Netlify AI Gateway — recommended
Use a credit-based Netlify plan and make at least one production deploy so AI Gateway activates. If you want Netlify-managed inference, do **not** create your own provider key/base-URL variables for OpenAI, Gemini, Anthropic or OpenRouter. Netlify injects the provider keys and custom base URLs into Functions automatically.

Optional model overrides:
- `OPENAI_MODEL` (default `gpt-5.6-luna`)
- `GEMINI_MODEL` (default `gemini-3.7-flash`)
- `ANTHROPIC_MODEL` (default `claude-haiku-4-5`)
- `OPENROUTER_MODEL` (default `openrouter/auto`)

Keep `HERCULES_ALLOW_DIRECT_AI=false` unless you deliberately want to use your own provider account. AI Gateway avoids separate provider balances but still consumes Netlify credits.

## 2. Device persistence
No login/password configuration is required. Hercules automatically creates a signed device session.

For optional authoritative server persistence, apply `supabase/migrations/20260909_hercules_user_state.sql` and set server-side:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Also set a strong `HERCULES_SESSION_SECRET` where practical. If omitted, Hercules can derive a stable secret from the Supabase secret or Netlify Blobs.

## 3. Runtime assets
No Google Drive connection is required at runtime. Exercise, home-workout, food and official brand assets are stored as versioned text chunks under `asset-bundle-v0.14.0/`; Netlify runs `npm run build`, reconstructs the compressed bundle, verifies its SHA-256, expands it into `public/assets/`, then executes the full release gate. `asset-manifest.json` fingerprints the curated release. Drive remains the master/editorial library.

## 4. Smoke test before deployment
Run `npm run check` (it prepares the verified asset bundle automatically). After the first production deploy verify:
- first launch opens language/onboarding with no login screen;
- Month 1 generation reaches Home;
- official Hercules logos render in light/dark UI;
- TRAIN, NOURISH, RECOVER, MIND, TRACK and EVOLVE render without console errors;
- Settings has Export Monthly Report and Restore Progress, and no Logout/Sign out control;
- the exported PDF can restore progress on a clean browser profile;
- Settings reports Netlify AI Gateway after activation;
- adaptive catalog candidates are traced when created;
- Month 2+ remains locked until 28 days + final training week + Final Mark;
- symptom/safety HOLD cannot be auto-released;
- the service worker updates to the current `hercules-hub-v0.14.0` cache.

## 5. Rollback
Revert/redeploy the parent commit of v0.14.0. The Supabase table migration is additive; do not delete user state during an application rollback. A user can also restore from their latest Hercules PDF if local browser data is lost.
