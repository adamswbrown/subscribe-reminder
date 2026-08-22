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

Suggested V1 stack (matching the strongest recent projects in §1): Next.js/React PWA,
SQLite/Postgres, a daily reminder-scheduler job, web push + email (Resend/Postmark) +
ICS endpoint. Self-hostable via Docker from day one — that's the audience that adopted
Wallos and subtrackr.

## 9. Roadmap sketch

- **V1:** picker onboarding + seed catalog, manual subscriptions, intent field, typed
  reminders (push/email/ICS), expense dashboard (monthly/annual totals, category
  breakdown, cash-flow calendar), confirm-cancel loop with savings tally.
- **V2:** bank-CSV import with recurring detection, bundles, household sharing/splitting,
  reminder-behaviour learning, price history + lifetime spend per service.
- **V3:** email receipt parsing, Open Banking sync, "how to cancel" playbooks per service,
  community catalog contributions.

## 10. Open questions

1. Single-user self-hosted first (Wallos audience) or hosted multi-tenant from day one?
2. GBP/UK-centric catalog first (Now TV, PureGym, BT…) with region packs later — acceptable?
3. Is "paused" state needed at V1 (e.g. Audible pause, gym freeze) or is cancelled+re-add enough?
4. How much of the catalog do we ship vs. lazy-create from free text + favicon?
