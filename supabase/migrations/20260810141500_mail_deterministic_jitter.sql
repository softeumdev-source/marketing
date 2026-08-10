-- claim_next used random() jitter while next_ready_in did not know about it, so
-- the worker could wake up to `jitter_seconds` too early, fail to claim, and end
-- its run without sending. Deriving the jitter from (account, last_send_at)
-- makes it stable for a given slot, so both functions compute the same gap while
-- the cadence stays irregular from the recipient's point of view.
create or replace function public.mail_jitter(p_account uuid, p_last timestamptz, p_max int)
returns integer language sql immutable as $function$
  select case
    when coalesce(p_max, 0) <= 0 then 0
    else (abs(hashtextextended(
            p_account::text || coalesce(extract(epoch from p_last), 0)::text, 0))
          % (p_max + 1))::int
  end
$function$;

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

create or replace function public.mail_next_ready_in(p_secret text)
returns integer
language plpgsql security definer set search_path to 'public' stable as $function$
declare
  v_s public.mail_settings%rowtype;
  v_tz text; v_local timestamp; v_time time; v_now timestamptz := now();
  v_jitter int; v_wait int;
begin
  if not public.mail_check_secret(p_secret) then raise exception 'unauthorized'; end if;

  select * into v_s from public.mail_settings where id = 1;
  v_tz    := coalesce(v_s.timezone, 'America/Sao_Paulo');
  v_local := v_now at time zone v_tz;
  v_time  := v_local::time;
  v_jitter := greatest(coalesce(v_s.jitter_seconds, 0), 0);

  if v_s.send_window_start <> v_s.send_window_end then
    if v_s.send_window_start < v_s.send_window_end then
      if v_time < v_s.send_window_start or v_time >= v_s.send_window_end then return null; end if;
    else
      if v_time < v_s.send_window_start and v_time >= v_s.send_window_end then return null; end if;
    end if;
  end if;
  if v_s.send_weekdays_only and extract(isodow from v_local) > 5 then return null; end if;

  -- Must mirror claim_next exactly, including the jitter term.
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
