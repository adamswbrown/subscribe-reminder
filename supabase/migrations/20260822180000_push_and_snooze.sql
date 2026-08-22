-- Web push + snooze:
-- 1. Subscription-level snooze (reminders_snoozed_until) that the reminder
--    generator respects, so "snooze 3 days" actually silences the ladder.
-- 2. due_notifications returns user_id so the scheduler can fan out web push
--    alongside email (return type change requires drop/recreate).
-- 3. Secret-gated functions for the scheduler to read push endpoints for
--    users with due reminders and to prune dead endpoints.

alter table public.subscriptions
  add column if not exists reminders_snoozed_until date;

drop function public.due_notifications(text);

create function public.due_notifications(p_secret text)
returns table (
  id bigint,
  user_id uuid,
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
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'decide_nudge', 'email', v_today::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'review'
    and s.next_renewal_date between v_today and v_today + 3
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'trial_ending', 'email', s.trial_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.trial_end_date is not null
    and s.trial_end_date between v_today and v_today + 2
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'renewal_heads_up', 'email', s.next_renewal_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intent = 'keep'
    and (s.cycle = 'yearly' or s.price > 25)
    and s.next_renewal_date between v_today and v_today + 7
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'contract_cliff', 'email', s.contract_end_date::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.contract_end_date is not null
    and s.contract_end_date between v_today and v_today + 40
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  insert into public.reminder_log (user_id, subscription_id, kind, channel, scheduled_for)
  select s.user_id, s.id, 'intro_price_ending', 'email', s.intro_ends::timestamptz
  from public.subscriptions s
  where s.state = 'active' and s.intro_ends is not null
    and s.intro_ends between v_today and v_today + 14
    and (s.reminders_snoozed_until is null or s.reminders_snoozed_until <= v_today)
  on conflict (subscription_id, kind, scheduled_for) do nothing;

  return query
  select r.id, r.user_id, u.email::text, s.name, r.kind::text,
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
    and (r.snoozed_until is null or r.snoozed_until <= now())
    and (s.reminders_snoozed_until is null
         or s.reminders_snoozed_until <= (now() at time zone 'Europe/London')::date);
end;
$$;

revoke all on function public.due_notifications(text) from public, authenticated;
grant execute on function public.due_notifications(text) to anon;

create function public.get_push_subscriptions(p_secret text, p_user_ids uuid[])
returns table (user_id uuid, endpoint text, p256dh text, auth text)
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

  return query
  select p.user_id, p.endpoint, p.p256dh, p.auth
  from public.push_subscriptions p
  where p.user_id = any(p_user_ids);
end;
$$;

revoke all on function public.get_push_subscriptions(text, uuid[]) from public, authenticated;
grant execute on function public.get_push_subscriptions(text, uuid[]) to anon;

create function public.delete_push_subscription(p_secret text, p_endpoint text)
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

  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke all on function public.delete_push_subscription(text, text) from public, authenticated;
grant execute on function public.delete_push_subscription(text, text) to anon;
