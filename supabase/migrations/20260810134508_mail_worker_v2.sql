drop function if exists public.mail_scan_accounts(text);
drop function if exists public.mail_touch_scan(text, uuid);

-- ============================================================
-- claim_next v2
--   * respects a configurable sending window / weekday rule
--   * paces PER ACCOUNT (not per campaign) so N active accounts give
--     N x throughput, with random jitter so the cadence is not robotic
--   * honours retry backoff (next_attempt_at)
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
  v_gap int; v_time time;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;

  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := v_now at time zone v_tz;
  v_today := v_local::date;
  v_time  := v_local::time;

  -- Roll the daily counters over at local midnight.
  update public.mail_campaigns      set sent_today = 0, last_reset_date = v_today
    where last_reset_date is distinct from v_today;
  update public.mail_gmail_accounts set sent_today = 0, last_reset_date = v_today
    where last_reset_date is distinct from v_today;

  -- Sending window (equal start/end == always on).
  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      if v_time < v_s.send_window_start or v_time >= v_s.send_window_end then return; end if;
    else -- window wraps past midnight
      if v_time < v_s.send_window_start and v_time >= v_s.send_window_end then return; end if;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then return; end if;

  -- Campaign with work left today.
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

  -- Required gap for this send, plus jitter.
  v_gap := greatest(coalesce(v_campaign.send_interval_seconds, 60), 1)
           + floor(random() * greatest(coalesce(v_s.jitter_seconds, 0), 0))::int;

  -- Least-loaded active account whose own interval has elapsed.
  select a.* into v_account from public.mail_gmail_accounts a
  where a.status = 'active'
    and a.sent_today < a.daily_limit
    and (v_campaign.gmail_account_id is null or a.id = v_campaign.gmail_account_id)
    and (a.last_send_at is null
         or v_now - a.last_send_at >= make_interval(secs => greatest(v_gap, a.min_interval_seconds)))
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
         attempts = attempts + 1, next_attempt_at = null
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

-- ============================================================
-- mark_failed v2: exponential backoff, and treat SMTP-time hard
-- rejections as bounces instead of burning three retries on them.
-- ============================================================
create or replace function public.mail_mark_failed(p_secret text, p_contact_id uuid, p_error text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_c public.mail_contacts%rowtype; v_max int; v_hard boolean;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;
  select * into v_c from public.mail_contacts where id = p_contact_id;
  if not found then return; end if;

  v_max := coalesce((select max_attempts from public.mail_settings where id = 1), 3);

  -- Release the slot reserved at claim time.
  update public.mail_campaigns      set sent_today = greatest(sent_today - 1, 0) where id = v_c.campaign_id;
  update public.mail_gmail_accounts set sent_today = greatest(sent_today - 1, 0) where id = v_c.gmail_account_id;

  v_hard := p_error ~* '(5\.1\.1|5\.1\.10|no such user|user unknown|does not exist|recipient rejected|address rejected|mailbox unavailable|invalid recipient)';

  if v_hard then
    -- Permanent: park it in the invalid box (trigger adds it to the suppression list).
    update public.mail_contacts
       set status = 'bounced', bounced_at = now(),
           bounce_reason = left(p_error, 500), next_attempt_at = null
     where id = p_contact_id;
    insert into public.mail_events (contact_id, campaign_id, type, meta)
    values (p_contact_id, v_c.campaign_id, 'bounce',
            jsonb_build_object('reason', left(p_error, 500), 'source', 'smtp'));

  elsif v_c.attempts >= v_max then
    update public.mail_contacts
       set status = 'failed', last_error = left(p_error, 500), next_attempt_at = null
     where id = p_contact_id;
    insert into public.mail_events (contact_id, campaign_id, type, meta)
    values (p_contact_id, v_c.campaign_id, 'failed', jsonb_build_object('error', left(p_error, 500)));

  else
    -- Transient: retry later with exponential backoff (5min, 10min, 20min...).
    update public.mail_contacts
       set status = 'pending', last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(
             secs => 300 * power(2, greatest(v_c.attempts - 1, 0))::int)
     where id = p_contact_id;
  end if;
end $function$;

-- ============================================================
-- register_open v2: a pixel hit that arrives seconds after the send is
-- the provider's image proxy, not a person. Record it as 'prefetch'.
-- ============================================================
create or replace function public.mail_register_open(p_tracking uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_c public.mail_contacts%rowtype; v_delay int;
begin
  select * into v_c from public.mail_contacts where tracking_id = p_tracking;
  if not found then return; end if;

  v_delay := coalesce((select open_min_delay_seconds from public.mail_settings where id = 1), 60);

  if v_c.sent_at is not null and now() - v_c.sent_at < make_interval(secs => v_delay) then
    update public.mail_contacts set prefetch_count = prefetch_count + 1 where id = v_c.id;
    insert into public.mail_events (contact_id, campaign_id, type)
    values (v_c.id, v_c.campaign_id, 'prefetch');
    return;
  end if;

  update public.mail_contacts
     set open_count = open_count + 1, last_open_at = now(),
         opened_at = coalesce(opened_at, now())
   where id = v_c.id;
  insert into public.mail_events (contact_id, campaign_id, type)
  values (v_c.id, v_c.campaign_id, 'open');
end $function$;

-- ============================================================
-- unsubscribe v2: log it as its own event type (was polluting 'failed').
-- The suppression trigger makes it permanent.
-- ============================================================
create or replace function public.mail_unsubscribe(p_tracking uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_c public.mail_contacts%rowtype;
begin
  select * into v_c from public.mail_contacts where tracking_id = p_tracking;
  if not found then return; end if;
  if v_c.status in ('unsubscribed', 'bounced', 'replied') then return; end if;
  update public.mail_contacts
     set status = 'unsubscribed', unsubscribed_at = now(), next_attempt_at = null
   where id = v_c.id;
  insert into public.mail_events (contact_id, campaign_id, type, meta)
  values (v_c.id, v_c.campaign_id, 'unsubscribe', jsonb_build_object('source', 'link'));
end $function$;

-- ============================================================
-- Incremental IMAP scanning support.
-- ============================================================
create function public.mail_scan_accounts(p_secret text)
returns table(id uuid, email text, app_password_enc text, last_scan_uid bigint, last_scan_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;
  return query
    select a.id, a.email::text, a.app_password_enc, a.last_scan_uid, a.last_scan_at
    from public.mail_gmail_accounts a
    where a.status = 'active'
    order by a.last_scan_at asc nulls first;
end $function$;

-- Persist the IMAP cursor so the next run only reads NEW messages.
create function public.mail_touch_scan(p_secret text, p_account_id uuid, p_uid bigint default null, p_error text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;
  update public.mail_gmail_accounts
     set last_scan_at  = now(),
         last_scan_uid = greatest(last_scan_uid, coalesce(p_uid, last_scan_uid)),
         scan_error    = left(p_error, 500)
   where id = p_account_id;
end $function$;

-- Which of these inbound addresses are actually contacts of ours?
-- Lets the scanner fetch full message bodies only for relevant mail.
create or replace function public.mail_known_contacts(p_secret text, p_emails text[])
returns table(email text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;
  return query
    select distinct c.email::text
    from public.mail_contacts c
    where c.email_norm in (select public.mail_norm_email(e) from unnest(p_emails) e);
end $function$;
