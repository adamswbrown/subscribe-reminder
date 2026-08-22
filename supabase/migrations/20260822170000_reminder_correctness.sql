-- Review fixes:
-- 1. due_notifications returned scheduled_for (i.e. "today") as event_date for
--    ladder reminders, so emails stated the wrong deadline. Return the real
--    per-kind event date instead.
-- 2. Honor reminder_log.snoozed_until when selecting pending reminders.
-- 3. Use the Europe/London calendar date, not the server's UTC date, for all
--    day-window logic (single-market UK product; see BRAINSTORM decisions).
-- 4. calendar_feed now returns the subscription id so ICS UIDs can be stable
--    and collision-free (requires drop/recreate: return type changes).

create or replace function public.tick_advance()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
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
    where state = 'active' and next_renewal_date < v_today;
    exit when not found;
  end loop;

  update public.subscriptions
    set state = 'active', paused_until = null
  where state = 'paused' and paused_until is not null
    and paused_until <= v_today;
end;
$$;

create or replace function public.due_notifications(p_secret text)
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
#variable_conflict use_column
declare
  v_secret text;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  select c.value into v_secret from private.config c where c.key = 'cron_secret';
  if v_secret is null or v_secret <> p_secret then
    raise exception 'unauthorized';
  end if;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'cancel_deadline', 'email', v_today::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'cancel'
    and s.action_deadline between v_today and v_today + 3
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'decide_nudge', 'email', v_today::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'review'
    and s.next_renewal_date between v_today and v_today + 3
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'trial_ending', 'email', s.trial_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.trial_end_date is not null
    and s.trial_end_date between v_today and v_today + 2
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'renewal_heads_up', 'email', s.next_renewal_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'keep'
    and (s.cycle = 'yearly' or s.price > 25)
    and s.next_renewal_date between v_today and v_today + 7
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'contract_cliff', 'email', s.contract_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.contract_end_date is not null
    and s.contract_end_date between v_today and v_today + 40
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'intro_price_ending', 'email', s.intro_ends::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intro_ends is not null
    and s.intro_ends between v_today and v_today + 14
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  return query
  select r.id, u.email::text, s.name, r.kind::text,
         case r.kind
           when 'cancel_deadline' then s.action_deadline
           when 'decide_nudge' then s.next_renewal_date
           when 'trial_ending' then s.trial_end_date
           when 'renewal_heads_up' then s.next_renewal_date
           when 'contract_cliff' then s.contract_end_date
           when 'intro_price_ending' then s.intro_ends
           else r.scheduled_for::date
         end,
         s.price, s.notice_period_days
  from public.reminder_log r
  join public.subscriptions s on s.id = r.subscription_id
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.channel = 'email' and u.email is not null
    and (r.snoozed_until is null or r.snoozed_until <= now());
end;
$$;

drop function public.calendar_feed(uuid);

create function public.calendar_feed(p_token uuid)
returns table (
  sub_id uuid,
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
  select id, name, 'renewal', next_renewal_date, price, currency, intent::text from subs
  union all
  select id, name, 'cancel_deadline', action_deadline, price, currency, intent::text
    from subs where intent = 'cancel' and action_deadline <> next_renewal_date
  union all
  select id, name, 'trial_end', trial_end_date, price, currency, intent::text
    from subs where trial_end_date is not null
  union all
  select id, name, 'contract_end', contract_end_date, price, currency, intent::text
    from subs where contract_end_date is not null
  union all
  select id, name, 'intro_end', intro_ends, price, currency, intent::text
    from subs where intro_ends is not null;
$$;

revoke all on function public.calendar_feed(uuid) from public, authenticated;
grant execute on function public.calendar_feed(uuid) to anon;
