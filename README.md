# subscribe-reminder

Track your subscriptions — streaming, gyms, broadband, news, gaming — and get
reminded **in time to actually cancel or renegotiate**, not just told what you spend.

Most subscription trackers are expense dashboards. This one is built around
**intent and deadlines**: every subscription records what you plan to do with it
(keep / cancel before renewal / decide later) and the date that actually matters —
`action_deadline = next renewal − cancellation notice period`. A gym with 30 days'
notice reminds you a month before renewal; a streaming trial reminds you the day
before it converts. "I'm just taking it for a month" is a single checkbox at signup.

## Features

- **Onboarding picker** — 88 common UK services with real logos, plan tiers, and
  typical prices pre-filled (Netflix Premium vs Standard, gym notice periods,
  broadband contract terms). Free-text add for everything else.
- **Intent-first tracking** — keep / cancel / review on every subscription, with a
  confirm-cancel loop that banks a running "you're saving £X/mo" tally.
- **Typed reminders** — cancel-deadline ladder (daily in the final 3 days), trial
  ending, renewal heads-up for annuals and big charges, contract cliffs (time to
  renegotiate broadband), intro-price endings — with per-subscription snooze.
- **Three reminder channels** — email (Resend), web push (VAPID, per-device
  toggle), and a **private ICS calendar feed**: subscribe once in Apple/Google/
  Outlook and every deadline appears as a real calendar event with an alarm.
- **Expense view** — monthly/annual totals (annuals normalised to effective
  monthly cost), category breakdown, next-30-days cash flow, automatic price
  history on every edit.
- **Installable PWA** — add to home screen on iOS/Android, offline fallback,
  standalone display.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, standalone output), React 19 |
| Database & auth | Supabase — Postgres with owner-only RLS, magic-link email login |
| Hosting | Railway — one always-on container (app + reminder scheduler), Dockerfile build |
| Email | Resend |
| Reminder engine | Hourly in-process tick → secret-gated Postgres functions (`due_notifications`, `tick_advance`) that roll renewal dates forward and queue deduplicated reminders, on the Europe/London calendar day |

Design decisions, prior-art survey, and the full product brainstorm live in
**[BRAINSTORM.md](BRAINSTORM.md)**. The service catalog that seeds the picker is
**[data/catalog.seed.json](data/catalog.seed.json)** — community-friendly JSON with
categories, plans, typical prices, billing cycles, notice periods, and cancel methods.

## Repository layout

```
app/                 Next.js routes: landing, login, /dashboard (add/edit/settings),
                     API routes (ICS feed, favicon proxy, push key, health)
components/          Picker flow, subscription form, dashboard rows, push toggle
lib/                 Supabase clients, money/date helpers, catalog, scheduler
supabase/migrations/ Schema + database functions (applied to the live project;
                     runnable locally via `supabase start`)
data/                Seed service catalog
public/              PWA icons, service worker
```

## Local development

```bash
cp .env.example .env       # fill in Supabase URL + publishable key
npm install
npm run dev
```

The database schema ships as Supabase migrations; run them against any project
(or a local `supabase start` stack). Server-only features (email, push) activate
when their env vars are present and degrade to logging when absent — see
`.env.example` for the full list.

## Deployment

Deploys are container-based (see `Dockerfile` and `railway.json`): Railway builds
the Dockerfile on every push to the tracked branch and runs the app and the
reminder scheduler in a single always-on service, with `/api/health` as the
healthcheck. `NEXT_PUBLIC_*` values are passed as build args; everything else is
runtime env. Self-hosting elsewhere works anywhere the container runs — hosted
deployment is the primary target (see BRAINSTORM.md §8).

## Status

V1 is live and functional: picker onboarding, dashboard, all three reminder
channels, PWA install. On the roadmap next (BRAINSTORM.md §9): the guided
discovery audit ("what am I even subscribed to?"), plan-from-price inference,
bank-CSV import with recurring detection, bundles, and household sharing.
