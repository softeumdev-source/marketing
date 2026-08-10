-- ============================================================
-- Atomic import. One round trip instead of ~60, and it reports exactly
-- why each row was rejected. Runs as the caller (RLS applies).
-- Duplicates are impossible at three levels:
--   1. within the uploaded file      -> collapsed by normalised e-mail
--   2. anywhere else in the system   -> unique index on email / email_norm
--   3. previously unsubscribed/bounced -> suppression list
-- ============================================================
create or replace function public.mail_import_contacts(p_campaign uuid, p_rows jsonb)
returns jsonb language plpgsql as $function$
declare
  v_total int; v_valid int; v_uniq int;
  v_suppressed int; v_existing int; v_inserted int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array JSON';
  end if;
  if not exists (select 1 from public.mail_campaigns where id = p_campaign) then
    raise exception 'campanha não encontrada';
  end if;

  select count(*) into v_total from jsonb_array_elements(p_rows);
  if v_total > 100000 then
    raise exception 'lote muito grande: % linhas (máximo 100000 por importação)', v_total;
  end if;

  with raw as (
    select btrim(lower(e ->> 'email')) as email,
           left(btrim(coalesce(e ->> 'nome', '')), 120) as name
    from jsonb_array_elements(p_rows) e
  ),
  valid as (
    select email, name, public.mail_norm_email(email) as norm
    from raw
    where email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
  ),
  uniq as (
    select norm,
           (array_agg(email order by length(email), email))[1] as email,
           coalesce((array_remove(array_agg(name order by length(name) desc), ''))[1], '') as name
    from valid group by norm
  ),
  eligible as (
    select u.* from uniq u
    where not exists (select 1 from public.mail_suppressions s where s.email_norm = u.norm)
  ),
  ins as (
    insert into public.mail_contacts (campaign_id, email, name)
    select p_campaign, e.email, e.name from eligible e
    on conflict do nothing
    returning 1
  )
  select (select count(*) from valid),
         (select count(*) from uniq),
         (select count(*) from uniq u
            where exists (select 1 from public.mail_suppressions s where s.email_norm = u.norm)),
         (select count(*) from eligible e
            where exists (select 1 from public.mail_contacts c where c.email_norm = e.norm)),
         (select count(*) from ins)
    into v_valid, v_uniq, v_suppressed, v_existing, v_inserted;

  return jsonb_build_object(
    'total',              v_total,
    'inserted',           v_inserted,
    'invalid',            v_total - v_valid,
    'duplicates_in_file', v_valid - v_uniq,
    'already_in_system',  v_existing,
    'suppressed',         v_suppressed
  );
end $function$;

-- ============================================================
-- Everything the dashboard needs, in one call.
-- ============================================================
create or replace function public.mail_dashboard(p_days int default 14)
returns jsonb
language plpgsql security definer set search_path to 'public' stable as $function$
declare
  v_s public.mail_settings%rowtype;
  v_tz text; v_local timestamp; v_today date; v_time time;
  v_in_window boolean := true;
  v_days int := greatest(least(coalesce(p_days, 14), 90), 1);
  v_pending bigint; v_avg numeric; v_from timestamptz;
begin
  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := now() at time zone v_tz;
  v_today := v_local::date;
  v_time  := v_local::time;
  v_from  := ((v_today - (v_days - 1))::timestamp) at time zone v_tz;

  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      v_in_window := v_time >= v_s.send_window_start and v_time < v_s.send_window_end;
    else
      v_in_window := v_time >= v_s.send_window_start or v_time < v_s.send_window_end;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then
    v_in_window := false;
  end if;

  select count(*) into v_pending from public.mail_contacts where status = 'pending';

  -- Average real throughput over the last 7 days that actually sent something.
  select avg(n) into v_avg from (
    select count(*) as n from public.mail_events
    where type = 'sent' and created_at >= ((v_today - 6)::timestamp at time zone v_tz)
    group by (created_at at time zone v_tz)::date
  ) t;

  return jsonb_build_object(
    'tz', v_tz,
    'now_local', v_local,
    'today', v_today,
    'in_window', v_in_window,
    'window', jsonb_build_object(
      'start', v_s.send_window_start, 'end', v_s.send_window_end,
      'weekdays_only', v_s.send_weekdays_only, 'jitter_seconds', v_s.jitter_seconds),

    'today_stats', (
      select jsonb_build_object(
        'sent',     count(*) filter (where type = 'sent'),
        'opens',    count(*) filter (where type = 'open'),
        'prefetch', count(*) filter (where type = 'prefetch'),
        'bounces',  count(*) filter (where type = 'bounce'),
        'replies',  count(*) filter (where type = 'reply'),
        'failed',   count(*) filter (where type = 'failed'),
        'unsubs',   count(*) filter (where type = 'unsubscribe'))
      from public.mail_events
      where created_at >= (v_today::timestamp at time zone v_tz)),

    'queue', (
      select jsonb_build_object(
        'total',        count(*),
        'pending',      count(*) filter (where status = 'pending'),
        'sending',      count(*) filter (where status = 'sending'),
        'sent',         count(*) filter (where status in ('sent', 'replied')),
        'failed',       count(*) filter (where status = 'failed'),
        'bounced',      count(*) filter (where status = 'bounced'),
        'replied',      count(*) filter (where status = 'replied'),
        'unsubscribed', count(*) filter (where status = 'unsubscribed'),
        'opened',       count(*) filter (where open_count > 0),
        'retry_queued', count(*) filter (where status = 'pending' and next_attempt_at > now()))
      from public.mail_contacts),

    'suppressed', (select count(*) from public.mail_suppressions),

    'capacity', (
      select jsonb_build_object(
        'limit_today', coalesce(sum(daily_limit) filter (where status = 'running'), 0),
        'sent_today',  coalesce(sum(sent_today)  filter (where status = 'running'), 0),
        'remaining_today', greatest(
          coalesce(sum(daily_limit) filter (where status = 'running'), 0)
          - coalesce(sum(sent_today) filter (where status = 'running'), 0), 0))
      from public.mail_campaigns),

    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email::text, 'display_name', a.display_name,
        'status', a.status, 'sent_today', a.sent_today, 'daily_limit', a.daily_limit,
        'remaining', greatest(a.daily_limit - a.sent_today, 0),
        'last_send_at', a.last_send_at, 'last_scan_at', a.last_scan_at,
        'scan_error', a.scan_error, 'last_error', a.last_error) order by a.created_at), '[]'::jsonb)
      from public.mail_gmail_accounts a),

    'series', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.d), '[]'::jsonb) from (
        select g::date as d,
          count(e.id) filter (where e.type = 'sent')        as sent,
          count(e.id) filter (where e.type = 'open')        as opens,
          count(e.id) filter (where e.type = 'prefetch')    as prefetch,
          count(e.id) filter (where e.type = 'bounce')      as bounces,
          count(e.id) filter (where e.type = 'reply')       as replies,
          count(e.id) filter (where e.type = 'failed')      as failed,
          count(e.id) filter (where e.type = 'unsubscribe') as unsubs
        from generate_series((v_today - (v_days - 1))::timestamp, v_today::timestamp, interval '1 day') g
        left join public.mail_events e
          on e.created_at >= v_from
         and (e.created_at at time zone v_tz)::date = g::date
        group by g
      ) x),

    'campaigns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'status', c.status,
        'daily_limit', c.daily_limit, 'sent_today', c.sent_today,
        'sent_count', c.sent_count, 'interval_seconds', c.send_interval_seconds,
        'last_send_at', c.last_send_at, 'gmail_account_id', c.gmail_account_id,
        'pending', (select count(*) from public.mail_contacts ct
                     where ct.campaign_id = c.id and ct.status = 'pending'),
        'total',   (select count(*) from public.mail_contacts ct where ct.campaign_id = c.id)
      ) order by c.created_at desc), '[]'::jsonb)
      from public.mail_campaigns c),

    'eta', jsonb_build_object(
      'pending', v_pending,
      'avg_per_day', round(coalesce(v_avg, 0), 1),
      'days_left', case when coalesce(v_avg, 0) > 0 then ceil(v_pending / v_avg) else null end,
      'finish_date', case when coalesce(v_avg, 0) > 0
                          then v_today + ceil(v_pending / v_avg)::int else null end)
  );
end $function$;

-- ============================================================
-- Sending settings, without ever exposing the worker secret.
-- ============================================================
create or replace function public.mail_get_settings()
returns jsonb language sql security definer set search_path to 'public' stable as $function$
  select jsonb_build_object(
    'timezone', timezone,
    'send_window_start', send_window_start,
    'send_window_end', send_window_end,
    'send_weekdays_only', send_weekdays_only,
    'jitter_seconds', jitter_seconds,
    'open_min_delay_seconds', open_min_delay_seconds,
    'max_attempts', max_attempts,
    'app_base_url', app_base_url,
    -- powers the in-app "rotate your secrets" warning
    'secret_is_default', worker_secret = '5abc044a8dd24410e895bee11442295eee930fb968b7c352')
  from public.mail_settings where id = 1
$function$;

create or replace function public.mail_update_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.mail_settings set
    timezone               = coalesce(nullif(p ->> 'timezone', ''), timezone),
    send_window_start      = coalesce((p ->> 'send_window_start')::time, send_window_start),
    send_window_end        = coalesce((p ->> 'send_window_end')::time, send_window_end),
    send_weekdays_only     = coalesce((p ->> 'send_weekdays_only')::boolean, send_weekdays_only),
    jitter_seconds         = greatest(least(coalesce((p ->> 'jitter_seconds')::int, jitter_seconds), 600), 0),
    open_min_delay_seconds = greatest(least(coalesce((p ->> 'open_min_delay_seconds')::int, open_min_delay_seconds), 3600), 0),
    max_attempts           = greatest(least(coalesce((p ->> 'max_attempts')::int, max_attempts), 10), 1),
    updated_at             = now()
  where id = 1;
  return public.mail_get_settings();
end $function$;

-- These read/write privileged data, so only a logged-in user may call them.
revoke execute on function public.mail_dashboard(int)        from public, anon;
revoke execute on function public.mail_get_settings()        from public, anon;
revoke execute on function public.mail_update_settings(jsonb) from public, anon;
revoke execute on function public.mail_import_contacts(uuid, jsonb) from public, anon;
grant  execute on function public.mail_dashboard(int)        to authenticated;
grant  execute on function public.mail_get_settings()        to authenticated;
grant  execute on function public.mail_update_settings(jsonb) to authenticated;
grant  execute on function public.mail_import_contacts(uuid, jsonb) to authenticated;
