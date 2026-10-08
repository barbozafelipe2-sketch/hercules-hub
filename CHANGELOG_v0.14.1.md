# Hercules Hub v0.14.1 — Family beta hardening

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
