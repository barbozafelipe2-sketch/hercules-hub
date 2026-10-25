# Hercules Hub v0.14.1 — Family beta hardening

- Made portable import local-first: preflight and restore now work offline, preserve profile identity, and recover interrupted local writes. A pending-sync marker prevents stale device cloud data from replacing an imported backup.
- Made full reset clear the device immediately; remote deletion is retried after connectivity returns, and a tombstone prevents old server state from being reloaded first.
- Updated backup preflight to validate bounded profile, plan, progress and chat data locally; SHA-256 is described accurately as corruption detection, not ownership/authentication.
- Added a permanent UUID to each profile and carried it through PDF export, restore and validated server payloads, without introducing a login screen. Older backups without an ID remain restorable and receive an ID on import.
- Bumped the app and service-worker cache version so existing mobile installs fetch the updated profile and backup code.
- Documented the current boundary: the portable UUID preserves backup identity, while server persistence and authorization remain device-scoped until the cross-device recovery credential flow is implemented.
- Kept the family/friends build device-first: no login, logout or Stripe.
- Closed the direct cycle-number advance path. Persistent installs must stage the next month through `/api/next-cycle` and activate it through the server-approved state action.
- Preserved server-staged `nextCycle` data against ordinary client state saves.
- Added deterministic filtering for common free-text dietary patterns (vegan, vegetarian, pescatarian, dairy-free/lactose-free, gluten-free and pork-free indicators) before bundled meals can be selected.
- Corrected Trace Lab catalog counts to show candidates generated in that cycle instead of accumulated catalog totals.
- Increased the smallest mobile labels while preserving the existing visual identity/layout.
- Added a reproducible npm lockfile for the pinned runtime dependencies.
- Added semantic regression checks for same-cycle-only persistence and approved next-month activation.
- Regenerated the committed QA/adaptive/security reports to the current suite (180/39/36) and added a main-branch check that fails if those reports drift.
- Expanded Decision Trace Lab retention to the schema cap of 40, added kind filters and reason notes, and added 1000 distinct lab regression cases (diet x signal x month x safety route).
