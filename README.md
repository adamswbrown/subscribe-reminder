# subscribe-reminder

Track your subscriptions — streaming, gyms, broadband, news, gaming — know when they
renew, and get smart reminders in time to actually cancel or renegotiate.

Currently in the ideas stage:

- **[BRAINSTORM.md](BRAINSTORM.md)** — prior art survey, data sources, domain model,
  onboarding flow, reminder design, and platform recommendation (PWA + email + ICS feed).
- **[data/catalog.seed.json](data/catalog.seed.json)** — starter catalog of ~45 common
  services (UK-leaning) with categories, typical plans/prices, billing cycles, and
  cancellation notice periods, for the onboarding picker.
- **[supabase/migrations](supabase/migrations)** — database schema, applied to the live
  Supabase project `subscribe-reminder` (eu-west-2): subscriptions with intent and a
  generated `action_deadline`, price history, reminder log, web-push endpoints, and
  per-user settings with the private ICS feed token — all behind owner-only RLS.
  Copy `.env.example` to `.env` for connection details.
