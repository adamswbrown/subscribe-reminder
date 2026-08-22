-- Server-side functions for the ICS calendar feed and the reminder scheduler.
-- calendar_feed is gated by the per-user ics_token (the URL *is* the secret);
-- due_notifications / mark_reminders_sent are gated by a cron secret stored in
-- private.config (inserted out-of-band, never in this repo).

create schema if not exists private;

create table if not exists private.config (
  key text primary key,
  value text not null
);

-- Deduplicate reminders per (subscription, kind, anchor timestamp)
create unique index if not exists reminder_dedupe_idx
  on public.reminder_log (subscription_id, kind, scheduled_for);

create function public.calendar_feed(p_token uuid)
returns table (
  sub_name text,
  event_kind text,
  event_date date,
  price numeric,
  currency text,
  intent text
)
language sql
security definer set search_path = ''
as $$
  with subs as (
    select s.*
    from public.subscriptions s
    join public.user_settings us on us.user_id = s.user_id
    where us.ics_token = p_token and s.state = 'active'
  )
  select name, 'renewal', next_renewal_date, price, currency, intent::text from subs
  union all
  select name, 'cancel_deadline', action_deadline, price, currency, intent::text
    from subs where intent = 'cancel' and action_deadline <> next_renewal_date
  union all
  select name, 'trial_end', trial_end_date, price, currency, intent::text
    from subs where trial_end_date is not null
  union all
  select name, 'contract_end', contract_end_date, price, currency, intent::text
    from subs where contract_end_date is not null
  union all
  select name, 'intro_end', intro_ends, price, currency, intent::text
    from subs where intro_ends is not null;
$$;

revoke all on function public.calendar_feed(uuid) from public, authenticated;
grant execute on function public.calendar_feed(uuid) to anon;

-- Roll lapsed renewal dates forward and lift expired pauses. Idempotent and
-- harmless to call repeatedly, so it is open to anon.
create function public.tick_advance()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  loop
    update public.subscriptions
      set next_renewal_date = (next_renewal_date + case cycle
        when 'weekly' then interval '7 days'
        when 'monthly' then interval '1 month'
        when 'quarterly' then interval '3 months'
        when 'yearly' then interval '1 year'
        else make_interval(days => greatest(coalesce(cycle_custom_days, 30), 1))
      end)::date
    where state = 'active' and next_renewal_date < current_date;
    exit when not found;
  end loop;

  update public.subscriptions
    set state = 'active', paused_until = null
  where state = 'paused' and paused_until is not null
    and paused_until <= current_date;
end;
$$;

revoke all on function public.tick_advance() from public;
grant execute on function public.tick_advance() to anon, authenticated;

create function public.due_notifications(p_secret text)
returns table (
  id bigint,
  email text,
  sub_name text,
  kind text,
  event_date date,
  price numeric,
  notice_period_days integer
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select c.value into v_secret from private.config c where c.key = 'cron_secret';
  if v_secret is null or v_secret <> p_secret then
    raise exception 'unauthorized';
  end if;

  -- Escalating ladder: one reminder per day inside the final window
  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'cancel_deadline', 'email', current_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'cancel'
    and s.action_deadline between current_date and current_date + 3
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'decide_nudge', 'email', current_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'review'
    and s.next_renewal_date between current_date and current_date + 3
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  -- Fire-once heads-ups, anchored to the event date so they never repeat
  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'trial_ending', 'email', s.trial_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.trial_end_date is not null
    and s.trial_end_date between current_date and current_date + 2
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'renewal_heads_up', 'email', s.next_renewal_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'keep'
    and (s.cycle = 'yearly' or s.price > 25)
    and s.next_renewal_date between current_date and current_date + 7
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'contract_cliff', 'email', s.contract_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.contract_end_date is not null
    and s.contract_end_date between current_date and current_date + 40
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'intro_price_ending', 'email', s.intro_ends::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intro_ends is not null
    and s.intro_ends between current_date and current_date + 14
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  return query
  select r.id, u.email::text, s.name, r.kind::text, r.scheduled_for::date,
         s.price, s.notice_period_days
  from public.reminder_log r
  join public.subscriptions s on s.id = r.subscription_id
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.channel = 'email' and u.email is not null;
end;
$$;

revoke all on function public.due_notifications(text) from public, authenticated;
grant execute on function public.due_notifications(text) to anon;

create function public.mark_reminders_sent(p_secret text, p_ids bigint[])
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_secret text;
begin
  select c.value into v_secret from private.config c where c.key = 'cron_secret';
  if v_secret is null or v_secret <> p_secret then
    raise exception 'unauthorized';
  end if;

  update public.reminder_log
    set sent_at = now()
  where id = any(p_ids) and sent_at is null;
end;
$$;

revoke all on function public.mark_reminders_sent(text, bigint[]) from public, authenticated;
grant execute on function public.mark_reminders_sent(text, bigint[]) to anon;
