# Subscribe-Reminder — Product Brainstorm

A personal tracker for recurring commitments — streaming, gyms, broadband, news, games —
that knows when they renew, what they cost, and (crucially) **when you need to act to
cancel them**. This document covers prior art, data sources, the domain model, onboarding,
reminder intelligence, and platform choice.

---

## 1. Prior art on GitHub (what exists, what's missing)

Surveyed 2026-08-22 via GitHub search:

| Project | Stars | Stack | Notes |
|---|---|---|---|
| [ellite/Wallos](https://github.com/ellite/Wallos) | ~8.4k | PHP, self-hosted | The category leader. Categories, multi-currency, logo search, notifications via email/Discord/Telegram/Gotify/Pushover/ntfy/webhooks, budget stats. Renewal-focused. |
| [huhusmang/Subscription-Management](https://github.com/huhusmang/Subscription-Management) | ~900 | TypeScript | Dashboard/expense-tracker angle. |
| [ajnart/subs](https://github.com/ajnart/subs) | ~500 | Next.js + shadcn/ui | Lightweight tracker, nice UX, minimal reminders. |
| [meceware/wapy.dev](https://github.com/meceware/wapy.dev) | ~500 | Next.js | Tracker + payment reminders in a dashboard. |
| [bscott/subtrackr](https://github.com/bscott/subtrackr) | ~460 | Go + HTMX | Self-hosted, homelab-oriented. |
| Firefly III (bills), Actual Budget (schedules) | 10k+ | — | Full budgeting apps with recurring-bill detection; heavyweight for this use case. |

**The gap all of them share:** they are *expense trackers* first. They tell you what you
spend and when the next payment lands. None of them are built around **intent** — "I took
this for one month and I want out before it renews", "my broadband contract ends in March
and the price will jump", "the gym needs 30 days' written notice".

**Positioning: two pillars, one data model.** We do both — a full expense view *and* the
intent/deadline layer — because they need the same inputs (price, cycle, renewal date)
and each makes the other better (see §7). Expense tracking is table stakes: Wallos proves
the demand and sets the bar, so we must clear it. Intent is the differentiator: it's what
none of the incumbents do, so it leads the UX. The home screen answers "what needs my
action?" first and "what am I spending?" second — a dashboard you *act from*, not one you
admire.

## 2. Data sources for the service catalog

There is no canonical open dataset of "consumer subscription services + plans + prices",
so we assemble one:

1. **Our own seed catalog** — a curated JSON file in this repo
   ([`data/catalog.seed.json`](data/catalog.seed.json), started alongside this doc):
   ~40 common services with category, typical plans/tiers, default billing cycle, typical
   price, cancellation notice period, and a cancellation URL where known. Small enough to
   maintain by hand, and it is exactly the data the onboarding picker needs. Community
   PRs can grow it (this is how Wallos, dashboard-icons, etc. scaled).
2. **Logos/brand assets:**
   - [simple-icons](https://github.com/simple-icons/simple-icons) — 3,000+ brand SVGs with
     official brand colours, CDN-hosted, npm-installable. Best fit for the picker grid.
   - [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons) (~8.6k★) —
     large PNG/SVG icon set for services, CDN-hosted.
   - Fallback chain for unknown services: favicon via `https://icons.duckduckgo.com/ip3/{domain}.ico`
     or logo.dev/Brandfetch (API key, free tier) → monogram avatar.
3. **Plan/price data:** prices churn constantly and vary by region — do **not** try to keep
   them authoritative. Store *typical* prices in the seed catalog as pre-filled defaults the
   user confirms or edits. The user's number is the source of truth, ours is just a head start.
4. **Later (V2+):** bank-export CSV import with recurring-payment detection (merchant-name
   normalisation gets us Netflix/Spotify/etc. from statement text); email receipt parsing.
   Open Banking APIs (TrueLayer/GoCardless Bank Account Data) are the "magic" endgame but
   bring compliance weight — explicitly out of scope for V1.

## 3. Domain model

The core insight: **the date that matters is rarely the renewal date — it's the last day
you can still act.** `action_deadline = next_renewal − notice_period`. For Netflix that's
effectively the renewal date; for a gym with 30 days' notice it's a month earlier; for an
18-month broadband contract it's the contract end minus the renegotiation window.

```
Subscription
├─ identity:   service (→ catalog id or free text), custom name, logo
├─ category:   streaming | music | gym | broadband | mobile | utilities |
│              news | gaming | software | insurance | storage | other
├─ plan:       tier label ("Premium", "Standard with ads"), seats/screens,
│              free-text fallback — see §5
├─ money:      price, currency (GBP default), billing cycle (monthly | yearly |
│              weekly | quarterly | custom rrule), next_renewal_date
├─ commitment: contract_end_date? (gym/broadband/mobile),
│              trial_end_date?, intro_price + intro_ends? ("£20/mo, £35 after March")
├─ intent:     keep | cancel_before_renewal | review   ← the key field
├─ friction:   notice_period_days (0 for streaming, 30 for most gyms),
│              cancel_method (in-app | website | phone | letter!), cancel_url
├─ meta:       payment method, shared-with/household, notes
├─ history:    price_history[] (kept automatically on every price edit — fuels §7)
└─ state:      active | cancelled(effective_date) | paused | expired
```

Derived, never stored: monthly-equivalent cost (annuals ÷ 12), total annual spend,
lifetime spend, `action_deadline`, "renewing in N days".

## 4. Onboarding — get to value in under two minutes

**Step 1 — the picker.** A grid of logo chips grouped by category (Streaming: Netflix,
Disney+, Prime Video, Now TV, Apple TV+… · Music: Spotify, Apple Music, YouTube Premium ·
News: NYT, The Times, The Guardian · Gaming: Game Pass, PS Plus, Nintendo Online ·
Household: broadband, mobile, energy, TV licence · Fitness: PureGym, The Gym Group,
David Lloyd…). Tap everything you have. Search-with-autocomplete over the catalog for
the rest; free-text "add your own" always available.

**Step 2 — rapid detail pass.** One card per picked service, pre-filled from the catalog
(typical plan, typical price, monthly cycle). The user only *must* answer two things:

- **When does it next renew?** — with forgiving inputs: exact date, "around the 15th",
  or "not sure" (defaults to 1st of next month, flagged low-confidence so the first
  reminder asks them to confirm rather than asserting).
- **What's your intent?** — three buttons: **Keep** / **Cancel before it renews** /
  **Not sure — remind me to decide**. Asking this at onboarding is the whole product;
  no competitor does it.

Everything else (exact plan tier, price, contract end) is editable but skippable.
Category-aware prompts appear only where they matter: picking a gym or broadband
provider surfaces "minimum term? notice period?" (pre-filled from catalog); picking a
streamer doesn't.

**Step 3 — instant payoff.** Show the dashboard immediately: total per month, total per
year, next three renewals, and anything already inside its action window. Then offer the
reminder channels (§6).

**Later imports (V2):** bank CSV upload → detect recurring merchants → "we found 6
subscriptions, confirm?"; forward-a-receipt email address; share-sheet from a
confirmation email on mobile.

### Discovery: onboarding when you don't know what you're subscribed to

The commercial apps (Monarch Money, Rocket Money, Origin, Simplifi — surveyed Aug 2026)
all answer this one way: link your bank, auto-detect recurring transactions, confirm.
That's the right V2/V3 endgame, but there's a V1 answer that needs **zero integrations**
and that none of the self-hosted projects do:

**The guided audit.** A wizard that walks the user through the places where their
subscriptions are already listed, one screen at a time, with the picker embedded so
finds become entries in two taps:

1. **Phone subscriptions** — iOS: Settings → your name → Subscriptions (deep link
   `https://apps.apple.com/account/subscriptions`); Android: Play Store → Payments &
   subscriptions. Catches every app-store-billed service (Apple One, Disney+, Duolingo,
   Headspace…). Highest yield per minute of any step.
2. **Bank app** — "open your banking app → Direct Debits & Standing Orders" (catches
   gym, broadband, insurance, charity giving, TV licence) and "card transactions →
   search for last month's small round amounts" (catches card-billed streamers).
3. **Amazon** — Account → Memberships & Subscriptions (Prime, Kindle Unlimited,
   Audible, Kids+, Subscribe & Save).
4. **PayPal** — Settings → Payments → Automatic payments (the graveyard of forgotten
   trials).
5. **Email sweep** — pre-built inbox search links, e.g. Gmail
   `subject:(receipt OR renewal OR "payment confirmation")` scoped to the last year;
   the user skims and taps matching chips.

Each step shows category-relevant picker chips ("found Sky? tap it") plus free-text.
A progress line ("most people find 8–12") sets expectations and gamifies completeness.

**Plan-from-price inference — solving "I don't know which plan".** Users rarely know
their tier, but they can see the *charge amount* in the same places the audit points
at. So invert the flow: on the add form, "Not sure which plan? Enter what you're
charged" — we reverse-match the amount against the catalog's plan prices (±15% to
absorb price rises) and suggest the tier: "£18.99/mo looks like Netflix Premium".
Wrong or no match → store the price with plan label blank; price drives every
calculation anyway, so an unknown plan costs the user nothing.

Same trick for dates: "when were you last charged?" is easier to find than "when does
it renew" — we compute the next renewal from last-charge + cycle, and mark the
confidence accordingly.

### What we take from prior art (concrete steals)

- **Rocket Money**: list *and* calendar view of upcoming charges (our cash-flow view +
  ICS feed cover this); default alert ~3 days before any charge; cancellation
  assistance as the premium tier — matches our monetisation decision.
- **Monarch Money**: manual "mark as recurring" complements auto-detection — our
  equivalent is lazy-create from free text; couples/household dashboard validates our
  V2 sharing plan; notifications 3 days before renewal as the default heads-up.
- **Wallos (GitHub)**: multi-channel notification fan-out (email/Discord/Telegram/
  ntfy/webhook) is their most-loved feature — our reminder_log channel enum is built
  to grow this way; logo search UX; per-subscription payment-method tracking.
- **subs / wapy.dev (GitHub)**: chip-based quick-add and minimal onboarding friction —
  already our picker's shape.
- **All of them**: nobody does notice periods, contract cliffs, or intent. Still the moat.

## 5. Capturing type / level of subscription

- The catalog carries **known plans per service** (e.g. Netflix: Standard with ads /
  Standard / Premium, each with typical price and screen count). Picking a plan pre-fills
  price; editing the price never fights the user — price wins, plan label is cosmetic.
- Services without plan data get a free-text tier field.
- **Seats/household** flag ("family plan, shared with 3 people") — enables a later
  "your share is £X" view and cost-splitting.
- **Bundles** noted via a simple `part_of` link (Apple One covers Music+TV+Arcade+iCloud)
  so the user doesn't double-count — V2, but the schema should not preclude it.
- Annual-vs-monthly toggle always shows the **effective monthly cost** so annuals aren't
  invisible for 11 months.

## 6. Reminder intelligence

Reminders are typed, not generic "Netflix renews tomorrow" noise:

| Type | Trigger | Default timing |
|---|---|---|
| **Cancel deadline** | intent = cancel, or trial ending | `action_deadline − 3d`, again at `−1d`, morning-of. Escalates across channels. |
| **Trial ending** | `trial_end_date` set | 2 days before, day before |
| **Renewal heads-up** | intent = keep, big/annual charges | 7d before annuals or anything > £25; silent for small monthlies (digest only) |
| **Decide-by nudge** | intent = review | halfway through current period + before renewal |
| **Contract cliff** | `contract_end_date` set | 40d before broadband/mobile (time to renegotiate — this is where the real money is), 35d before gyms with 30d notice |
| **Intro price ending** | `intro_ends` set | 2 weeks before the price jump |
| **Confirm-cancel loop** | after a cancel deadline passes | "Did you cancel?" → *Yes* (archive, show lifetime total saved) / *No, snooze* / *Keeping it* (flip intent) |

Design principles:

- **The "one month then cancel" flow is first-class:** at creation, "I'm taking this for
  a month" is a single toggle that sets intent = cancel and schedules the deadline ladder.
  Zero extra thought required at signup time, which is when people actually think of it.
- **Deadline-aware, not renewal-aware:** everything keys off `action_deadline`, so
  notice periods and phone-only cancellation (add a day of buffer) are handled correctly.
- **Escalation with acknowledgement:** a cancel-deadline reminder repeats and escalates
  channels until acted on or dismissed; a keep-renewal is fire-once. Snooze everywhere,
  but snoozing past the deadline warns explicitly ("snoozing past your last day to cancel").
- **Weekly digest** (email, Sunday evening): upcoming 30 days, anything needing a decision,
  month-over-month total. Keeps low-urgency noise out of push.
- **Learn from behaviour** (V2): repeatedly dismissing heads-ups for a service mutes that
  type for it; a "cancelled" outcome after a review nudge tightens future defaults.

## 7. The expense pillar

Everything here falls out of data the intent flow already collects — no extra onboarding
burden, which is why doing both is cheap:

- **Totals that don't lie:** per-month and per-year, with annuals/quarterlies normalised
  to effective monthly cost so a £95 Prime renewal isn't invisible for 11 months.
  Category breakdown (streaming vs household vs fitness).
- **Cash-flow calendar:** what's leaving the account in the next 30 days, day by day —
  the "why is this month expensive?" view. Falls out of the same schedule that drives
  reminders (and the ICS feed doubles as this on your real calendar).
- **Price history per subscription:** every time the user edits a price, keep the old one
  (`price_history[]`). Enables "Netflix has raised this plan 3 times since you joined,
  +40% total" — strong fuel for the review nudge.
- **Lifetime spend per service:** "you've paid Audible £287 since 2023" is the single most
  motivating stat for a cancel decision.
- **Saved-by-cancelling tally:** every confirmed cancellation banks its monthly cost into
  a running "you're saving £34/mo" counter. This is the bridge stat between the two
  pillars — expense data measuring the intent feature's win.

Where the pillars reinforce each other: the review nudge quotes cost ("still worth
£12.99? You've watched nothing flagged this one — you've spent £78 in 6 months"); the
expense view sorts by cost to surface cancellation candidates; the savings tally keeps
people coming back to the app that just told them to leave other apps.

The guardrail: budgets, spending goals, bank reconciliation, and general personal-finance
features stay out — that's Firefly/Actual territory. If a feature needs data that isn't a
subscription, it doesn't belong here.

## 8. Platform: how "native" to go

| Option | Reach | Reminder reliability | Effort |
|---|---|---|---|
| **PWA + web push** | Android great; iOS good since 16.4 (must Add to Home Screen) | Good | Low |
| **Email** | Universal | High (but inbox noise) | Trivial |
| **ICS calendar feed** | Every phone/desktop calendar, zero install | Native alarms, auto-updating | Low |
| Native apps | Best notifications | Best | High — not V1 |

**Recommendation: PWA-first, with email and a calendar feed as reminder channels — all
three, because they're cheap and cover each other's gaps.**

The **subscribable ICS feed is the sleeper feature**: each user gets a private URL
(`/calendar/{token}.ics`) they add once to Apple/Google/Outlook. Every renewal,
cancel-deadline, and contract-cliff becomes a real calendar event with a `VALARM`,
titled with intent ("⚠️ Last day to cancel Now TV"). It auto-updates as data changes,
survives uninstalls, needs no notification permissions, and *feels* completely native on
iOS — which is exactly where web push is weakest. (Caveat: Google Calendar refreshes
external feeds slowly, ~12–24h — fine for deadlines known weeks ahead, and push/email
cover the fast path.)

**Decision: this is a hosted product, not a self-hosted one.** The self-hosted niche is
well served (Wallos, subtrackr — that's their audience, not ours); the people who most
need cancel reminders will never run Docker. Hosted also makes the product actually work:
reminders fire from our infrastructure whether or not you ever reopen the app, email and
push come from managed senders with real deliverability, and the ICS feed URL is always
reachable. That said, the whole stack should still run from a single `docker compose up`
— for local dev, testing, and CI parity, and as a happy side effect anyone determined to
self-host can. It's a deployment mode we keep working, not a product line we design for:
no feature decisions get made for the self-host case.

Consequences for the V1 stack: multi-tenant and auth from day one (magic-link email login
fits — we need their email address for reminders anyway), managed Postgres (SQLite only
for tests), a scheduler/queue for reminder fan-out, Next.js/React PWA, web push + email
(Resend/Postmark) + ICS endpoint. Nothing exotic — one small server, one database, one
cron loop.

**Hosting decision: Supabase + Railway.**

- **Supabase** provides the managed Postgres, and its Auth gives us magic-link email
  login out of the box — exactly the auth we chose, deleting a chunk of V1 work. Row
  Level Security handles multi-tenant isolation cheaply. Schema ships as Supabase
  migrations; `supabase start` joins the local compose setup for dev parity. (Free-tier
  caveat: projects pause after ~a week of inactivity — the daily reminder cron keeps it
  awake, but move to paid before there are real users.)
- **Railway** runs the Next.js app *and* the reminder scheduler as one always-on
  container — the same image locally, in CI, and in prod. Chosen over Vercel because the
  cron **is** the product: a serverless cron with loose timing and no retries risks a
  silently missed cancel deadline, while a long-lived process we own gets precise timing,
  retries, and a dead-man's-switch ping. (Trade-off accepted: we give up Vercel's
  preview deployments; revisit a Vercel-frontend + Railway-worker split only if that
  starts to hurt.)

## 9. Roadmap sketch

- **V1:** picker onboarding + seed catalog, manual subscriptions, intent field, typed
  reminders (push/email/ICS), expense dashboard (monthly/annual totals, category
  breakdown, cash-flow calendar), confirm-cancel loop with savings tally.
- **V2:** bank-CSV import with recurring detection, bundles, household sharing/splitting,
  reminder-behaviour learning, price history + lifetime spend per service,
  paused-subscription management UI (pause/freeze with restart reminder).
- **V3:** email receipt parsing, Open Banking sync, "how to cancel" playbooks per service,
  community catalog contributions.

## 10. Decisions

Decided:

- **Hosted multi-tenant product**, not self-hosted-first (see §8). Self-hosting stays
  possible via the dev/test `docker compose` setup, but drives no feature decisions.
- **Infra: Supabase (Postgres + magic-link auth via Supabase Auth, RLS for tenant
  isolation) + Railway (Next.js app and reminder scheduler in one always-on container)**
  — chosen over Vercel because reliable, retryable cron delivery is the product (§8).
- **Both pillars**: expense view and intent/deadline layer, one data model (§1, §7).
- **UK-first catalog**, GBP default (§2, [`data/catalog.seed.json`](data/catalog.seed.json)).
  The catalog schema stays region-ready (per-service currency/price is just data), so
  other regions arrive later as additional catalog packs, not a schema change. Free-text
  add always works regardless of region.

- **Paused state: in the schema now, UI in V2.** Audible pauses and gym freezes are real,
  and an *unpause* is exactly the silent money-leak this app exists to catch (paused subs
  show £0 in totals, get a "payments restart on <date>" reminder). The state costs
  nothing to include in the model from day one; V1 ships without the management UI.
- **Catalog: curate the top ~50–100, lazy-create the long tail.** Unknown services get an
  entry created on the fly — favicon from the domain, user-typed price, no pre-fills.
  Frequently lazy-created services get promoted into the curated catalog over time, so
  usage data drives what we curate next.
- **Monetisation: free while personal-scale; revisit when there are real users.** If a
  paid tier ever exists it gates the expensive extras (bank imports, household sharing),
  never core tracking/reminders — and it must be aggressively honest: one-click cancel,
  a reminder before *our own* renewal, no dark patterns. A subscription app that's hard
  to cancel would be self-satire.

No open questions remain — next step is scaffolding V1 (§9).
