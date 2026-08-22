-- Fix: the output parameter "kind" shadowed reminder_log.kind inside the
-- ON CONFLICT clauses, making every scheduler tick fail with
-- 'column reference "kind" is ambiguous'. Resolve unqualified names to
-- columns; the RETURN QUERY selects are fully qualified already.

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
