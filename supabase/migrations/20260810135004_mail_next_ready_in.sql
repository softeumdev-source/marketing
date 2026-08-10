-- Seconds until the next e-mail may legitimately go out.
--   null -> nothing to send at all (queue empty, campaign paused, daily cap
--           reached, or outside the sending window) so the worker can exit
--           immediately instead of burning its execution budget spinning.
--   0    -> a send is due right now.
--
-- min() skips NULLs, so an account that had never sent (last_send_at IS NULL)
-- would be invisible whenever another account was mid-interval. "Never sent" is
-- back-dated inside the arithmetic so it reads as ready-now.
create or replace function public.mail_next_ready_in(p_secret text)
returns integer
language plpgsql security definer set search_path to 'public' stable as $function$
declare
  v_s public.mail_settings%rowtype;
  v_tz text; v_local timestamp; v_time time; v_now timestamptz := now();
  v_wait int;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;

  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := v_now at time zone v_tz;
  v_time  := v_local::time;

  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      if v_time < v_s.send_window_start or v_time >= v_s.send_window_end then return null; end if;
    else
      if v_time < v_s.send_window_start and v_time >= v_s.send_window_end then return null; end if;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then return null; end if;

  select min(greatest(
           0,
           ceil(extract(epoch from (
             coalesce(a.last_send_at, v_now - interval '10 years')
             + make_interval(secs => greatest(c.send_interval_seconds, a.min_interval_seconds))
             - v_now)))::int))
    into v_wait
  from public.mail_campaigns c
  join public.mail_gmail_accounts a
    on a.status = 'active'
   and a.sent_today < a.daily_limit
   and (c.gmail_account_id is null or a.id = c.gmail_account_id)
  where c.status = 'running'
    and c.sent_today < c.daily_limit
    and exists (
      select 1 from public.mail_contacts ct
      where ct.campaign_id = c.id and ct.status = 'pending'
        and (ct.next_attempt_at is null or ct.next_attempt_at <= v_now));

  return v_wait;
end $function$;
