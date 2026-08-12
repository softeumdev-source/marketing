-- A lease de 15 min devolve à fila o contato cujo envio foi abandonado (worker
-- morto entre o claim e o sendMail), mas devolvia só o status: a vaga diária
-- consumida no claim continuava contada. Isso inflava sent_today com envios
-- que nunca aconteceram — a mesma classe de problema que fazia o painel
-- mentir. Agora a liberação estorna os contadores, como mail_mark_failed já
-- fazia no caminho de erro.
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

  -- Lease vencida: o envio foi abandonado. Devolve o contato à fila E estorna
  -- a vaga diária que o claim havia reservado.
  with liberados as (
    update public.mail_contacts
       set status = 'pending', next_attempt_at = null
     where status = 'sending'
       and next_attempt_at is not null
       and next_attempt_at <= v_now
    returning campaign_id, gmail_account_id
  ),
  por_campanha as (
    select campaign_id, count(*) as n from liberados group by campaign_id
  ),
  por_conta as (
    select gmail_account_id, count(*) as n from liberados
     where gmail_account_id is not null group by gmail_account_id
  ),
  estorno_campanha as (
    update public.mail_campaigns c
       set sent_today = greatest(c.sent_today - p.n, 0)
      from por_campanha p where p.campaign_id = c.id
    returning 1
  )
  update public.mail_gmail_accounts a
     set sent_today = greatest(a.sent_today - p.n, 0)
    from por_conta p where p.gmail_account_id = a.id;

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
