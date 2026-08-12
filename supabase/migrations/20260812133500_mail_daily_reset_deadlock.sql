-- ============================================================
-- Corrige o deadlock da virada de dia.
--
-- O reset diário de sent_today acontecia apenas dentro de mail_claim_next,
-- mas o worker só chama claim_next depois que mail_next_ready_in devolve um
-- horário. Como next_ready_in filtrava por `sent_today < daily_limit` usando
-- o contador do dia anterior (nunca zerado), qualquer dia que terminasse com
-- uma campanha ou conta no limite deixava o sistema travado para sempre:
-- next_ready_in respondia "nada a enviar", claim_next nunca rodava, o
-- contador nunca zerava e o painel seguia exibindo o total de ontem como se
-- fosse de hoje.
--
-- A função é STABLE (não pode escrever), então em vez de zerar o contador ela
-- passa a calcular o valor efetivo: se last_reset_date não é hoje, o contador
-- vale 0. O reset físico continua em claim_next. mail_dashboard ganha a mesma
-- correção para que "enviados hoje" nunca mostre número de ontem.
-- ============================================================
create or replace function public.mail_next_ready_in(p_secret text)
returns integer
language plpgsql security definer set search_path to 'public' stable as $function$
declare
  v_s public.mail_settings%rowtype;
  v_tz text; v_local timestamp; v_time time; v_today date;
  v_now timestamptz := now();
  v_jitter int; v_wait int;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;

  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := v_now at time zone v_tz;
  v_time  := v_local::time;
  v_today := v_local::date;
  v_jitter := greatest(coalesce(v_s.jitter_seconds, 0), 0);

  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      if v_time < v_s.send_window_start or v_time >= v_s.send_window_end then return null; end if;
    else
      if v_time < v_s.send_window_start and v_time >= v_s.send_window_end then return null; end if;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then return null; end if;

  -- Deve espelhar claim_next, inclusive o jitter. O contador conta como zero
  -- quando ainda não virou o dia (o reset físico acontece em claim_next).
  select min(greatest(
           0,
           ceil(extract(epoch from (
             coalesce(a.last_send_at, v_now - interval '10 years')
             + make_interval(secs => greatest(
                 c.send_interval_seconds + public.mail_jitter(a.id, a.last_send_at, v_jitter),
                 a.min_interval_seconds))
             - v_now)))::int))
    into v_wait
  from public.mail_campaigns c
  join public.mail_gmail_accounts a
    on a.status = 'active'
   and (case when a.last_reset_date is distinct from v_today then 0 else a.sent_today end) < a.daily_limit
   and (c.gmail_account_id is null or a.id = c.gmail_account_id)
  where c.status = 'running'
    and (case when c.last_reset_date is distinct from v_today then 0 else c.sent_today end) < c.daily_limit
    and exists (
      select 1 from public.mail_contacts ct
      where ct.campaign_id = c.id and ct.status = 'pending'
        and (ct.next_attempt_at is null or ct.next_attempt_at <= v_now));

  return v_wait;
end $function$;

-- ============================================================
-- claim_next: o claim agora grava uma lease em next_attempt_at. Se o worker
-- morrer entre o claim e o envio (deploy, timeout, crash), o contato ficava
-- preso em 'sending' para sempre — contado como enviado sem e-mail algum.
-- Leases vencidas voltam para a fila no início de cada claim.
-- ============================================================
create or replace function public.mail_claim_next(p_secret text)
returns table(
  contact_id uuid, contact_email text, contact_name text, tracking_id uuid,
  campaign_id uuid, subject text, body_html text, from_name text, track_opens boolean,
  account_id uuid, account_email text, account_password_enc text,
  account_display_name text, account_signature text
)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_s        public.mail_settings%rowtype;
  v_campaign public.mail_campaigns%rowtype;
  v_account  public.mail_gmail_accounts%rowtype;
  v_contact  public.mail_contacts%rowtype;
  v_tz text; v_now timestamptz := now(); v_local timestamp; v_today date;
  v_base int; v_jitter int; v_time time;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;

  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := v_now at time zone v_tz;
  v_today := v_local::date;
  v_time  := v_local::time;

  update public.mail_campaigns      set sent_today = 0, last_reset_date = v_today
    where last_reset_date is distinct from v_today;
  update public.mail_gmail_accounts set sent_today = 0, last_reset_date = v_today
    where last_reset_date is distinct from v_today;

  -- Lease vencida: o worker morreu entre o claim e o envio. Devolve à fila.
  update public.mail_contacts
     set status = 'pending', next_attempt_at = null
   where status = 'sending' and next_attempt_at is not null and next_attempt_at <= v_now;

  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      if v_time < v_s.send_window_start or v_time >= v_s.send_window_end then return; end if;
    else
      if v_time < v_s.send_window_start and v_time >= v_s.send_window_end then return; end if;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then return; end if;

  select c.* into v_campaign from public.mail_campaigns c
  where c.status = 'running'
    and c.sent_today < c.daily_limit
    and exists (
      select 1 from public.mail_contacts ct
      where ct.campaign_id = c.id and ct.status = 'pending'
        and (ct.next_attempt_at is null or ct.next_attempt_at <= v_now))
  order by c.last_send_at asc nulls first
  for update skip locked limit 1;
  if not found then return; end if;

  v_base   := greatest(coalesce(v_campaign.send_interval_seconds, 60), 1);
  v_jitter := greatest(coalesce(v_s.jitter_seconds, 0), 0);

  select a.* into v_account from public.mail_gmail_accounts a
  where a.status = 'active'
    and a.sent_today < a.daily_limit
    and (v_campaign.gmail_account_id is null or a.id = v_campaign.gmail_account_id)
    and (a.last_send_at is null
         or v_now - a.last_send_at >= make_interval(secs => greatest(
              v_base + public.mail_jitter(a.id, a.last_send_at, v_jitter),
              a.min_interval_seconds)))
  order by a.sent_today asc, a.last_send_at asc nulls first
  for update skip locked limit 1;
  if not found then return; end if;

  select ct.* into v_contact from public.mail_contacts ct
  where ct.campaign_id = v_campaign.id and ct.status = 'pending'
    and (ct.next_attempt_at is null or ct.next_attempt_at <= v_now)
  order by ct.created_at asc
  for update skip locked limit 1;
  if not found then return; end if;

  update public.mail_contacts
     set status = 'sending', gmail_account_id = v_account.id,
         attempts = attempts + 1,
         next_attempt_at = v_now + interval '15 minutes'
   where id = v_contact.id;
  update public.mail_campaigns
     set sent_today = sent_today + 1, last_send_at = v_now where id = v_campaign.id;
  update public.mail_gmail_accounts
     set sent_today = sent_today + 1, last_send_at = v_now where id = v_account.id;

  contact_id  := v_contact.id;  contact_email := v_contact.email::text;
  contact_name := v_contact.name; tracking_id  := v_contact.tracking_id;
  campaign_id := v_campaign.id; subject := v_campaign.subject;
  body_html   := v_campaign.body_html; from_name := v_campaign.from_name;
  track_opens := v_campaign.track_opens;
  account_id  := v_account.id; account_email := v_account.email::text;
  account_password_enc := v_account.app_password_enc;
  account_display_name := v_account.display_name;
  account_signature    := v_account.signature_html;
  return next;
end $function$;

-- Contatos que já estavam presos em 'sending' antes da lease existir
-- (next_attempt_at nulo) voltam para a fila uma única vez aqui.
update public.mail_contacts
   set status = 'pending', next_attempt_at = null
 where status = 'sending' and next_attempt_at is null;

-- ============================================================
-- mark_sent: limpa a lease ao confirmar o envio (antes não existia em
-- migração nenhuma; fica registrada aqui).
-- ============================================================
create or replace function public.mail_mark_sent(p_secret text, p_contact_id uuid, p_message_id text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_campaign uuid;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;
  update public.mail_contacts
     set status = 'sent', sent_at = now(), message_id = p_message_id,
         last_error = null, next_attempt_at = null
   where id = p_contact_id returning campaign_id into v_campaign;
  update public.mail_campaigns set sent_count = sent_count + 1 where id = v_campaign;
  insert into public.mail_events(contact_id, campaign_id, type) values (p_contact_id, v_campaign, 'sent');
  if not exists (select 1 from public.mail_contacts where campaign_id = v_campaign and status in ('pending','sending')) then
    update public.mail_campaigns set status = 'completed' where id = v_campaign and status = 'running';
  end if;
end $function$;

-- ============================================================
-- Dashboard: "enviados hoje" de campanhas e contas passa a valer zero quando
-- o contador ainda é do dia anterior, em vez de exibir o total de ontem.
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
        'sent_today',  coalesce(sum(case when last_reset_date is distinct from v_today then 0 else sent_today end)
                          filter (where status = 'running'), 0),
        'remaining_today', greatest(
          coalesce(sum(daily_limit) filter (where status = 'running'), 0)
          - coalesce(sum(case when last_reset_date is distinct from v_today then 0 else sent_today end)
              filter (where status = 'running'), 0), 0))
      from public.mail_campaigns),

    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email::text, 'display_name', a.display_name,
        'status', a.status,
        'sent_today', case when a.last_reset_date is distinct from v_today then 0 else a.sent_today end,
        'daily_limit', a.daily_limit,
        'remaining', greatest(a.daily_limit
          - case when a.last_reset_date is distinct from v_today then 0 else a.sent_today end, 0),
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
        'daily_limit', c.daily_limit,
        'sent_today', case when c.last_reset_date is distinct from v_today then 0 else c.sent_today end,
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
