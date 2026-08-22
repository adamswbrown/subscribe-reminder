-- Initial schema for subscribe-reminder (see BRAINSTORM.md §3 domain model).
-- Multi-tenant via Supabase Auth; every row is owned by auth.users and guarded by RLS.

create type public.subscription_intent as enum ('keep', 'cancel', 'review');
create type public.subscription_state as enum ('active', 'cancelled', 'paused', 'expired');
create type public.billing_cycle as enum ('weekly', 'monthly', 'quarterly', 'yearly', 'custom');
create type public.cancel_method as enum ('in_app', 'website', 'phone', 'letter', 'varies');
create type public.reminder_kind as enum (
  'cancel_deadline', 'trial_ending', 'renewal_heads_up', 'decide_nudge',
  'contract_cliff', 'intro_price_ending', 'confirm_cancel', 'payments_restart'
);
create type public.reminder_channel as enum ('push', 'email', 'digest');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_id text,
  name text not null,
  category text not null default 'other',
  plan_label text,
  seats integer,
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'GBP',
  cycle public.billing_cycle not null default 'monthly',
  cycle_custom_days integer check (cycle_custom_days > 0),
  next_renewal_date date not null,
  -- 'exact' | 'approximate' | 'unknown' — low-confidence dates get a confirm-first reminder
  renewal_confidence text not null default 'exact'
    check (renewal_confidence in ('exact', 'approximate', 'unknown')),
  intent public.subscription_intent not null default 'review',
  trial_end_date date,
  contract_end_date date,
  intro_price numeric(10, 2) check (intro_price >= 0),
  intro_ends date,
  notice_period_days integer not null default 0 check (notice_period_days >= 0),
  -- the date that matters: last day the user can still act
  action_deadline date generated always as (next_renewal_date - notice_period_days) stored,
  cancel_method public.cancel_method not null default 'website',
  cancel_url text,
  payment_method text,
  shared_with text,
  notes text,
  state public.subscription_state not null default 'active',
  cancelled_effective date,
  paused_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_cycle_needs_days check (cycle <> 'custom' or cycle_custom_days is not null)
);

create index subscriptions_user_idx on public.subscriptions (user_id);
create index subscriptions_action_deadline_idx on public.subscriptions (action_deadline)
  where state = 'active';

-- §7 expense pillar: every price change is kept automatically
create table public.price_history (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  price numeric(10, 2) not null,
  currency text not null,
  effective_from date not null default current_date,
  recorded_at timestamptz not null default now()
);

create index price_history_subscription_idx on public.price_history (subscription_id);

-- Scheduled and sent reminders; the scheduler claims rows where sent_at is null
create table public.reminder_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  kind public.reminder_kind not null,
  channel public.reminder_channel not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now()
);

create index reminder_log_due_idx on public.reminder_log (scheduled_for) where sent_at is null;
create index reminder_log_user_idx on public.reminder_log (user_id);

-- Web push endpoints (one row per browser/device)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Per-user settings; ics_token is the secret in the private calendar-feed URL
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ics_token uuid not null unique default gen_random_uuid(),
  email_digest boolean not null default true,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

-- updated_at maintenance + automatic price history
create function public.handle_subscription_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.price is distinct from old.price or new.currency is distinct from old.currency then
    insert into public.price_history (subscription_id, price, currency)
    values (new.id, old.price, old.currency);
  end if;
  return new;
end;
$$;

create trigger subscriptions_before_update
  before update on public.subscriptions
  for each row execute function public.handle_subscription_update();

-- Default settings row on signup
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: owners only, on every table
alter table public.subscriptions enable row level security;
alter table public.price_history enable row level security;
alter table public.reminder_log enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.user_settings enable row level security;

create policy "own subscriptions" on public.subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own price history" on public.price_history
  for select using (exists (
    select 1 from public.subscriptions s
    where s.id = subscription_id and s.user_id = (select auth.uid())
  ));

create policy "own reminders" on public.reminder_log
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own push subscriptions" on public.push_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own settings" on public.user_settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
