-- ============================================================
-- 1. Canonical e-mail normalisation (anti-duplicate foundation)
--    gmail/googlemail: strip dots + "+tag"; everything else: strip "+tag".
-- ============================================================
create or replace function public.mail_norm_email(p text)
returns text language sql immutable strict parallel safe as $$
  select case
    when split_part(lower(btrim(p)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(btrim(p)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(btrim(p)), '@', 1), '+', 1)
         || '@' || split_part(lower(btrim(p)), '@', 2)
  end
$$;

alter table public.mail_contacts
  add column if not exists email_norm text
    generated always as (public.mail_norm_email(email::text)) stored;

create unique index if not exists mail_contacts_email_norm_key
  on public.mail_contacts (email_norm);

-- ============================================================
-- 2. Permanent suppression list.
--    Survives campaign deletion, so an unsubscribed / bounced address
--    can never be re-imported again.
-- ============================================================
create table if not exists public.mail_suppressions (
  email      citext primary key,
  email_norm text generated always as (public.mail_norm_email(email::text)) stored,
  reason     text not null check (reason in ('unsubscribed', 'bounced', 'complaint', 'manual')),
  detail     text,
  created_at timestamptz not null default now()
);

create unique index if not exists mail_suppressions_norm_key
  on public.mail_suppressions (email_norm);

alter table public.mail_suppressions enable row level security;

drop policy if exists p_auth_all on public.mail_suppressions;
create policy p_auth_all on public.mail_suppressions
  for all to authenticated using (true) with check (true);

-- Seed from history: everyone already unsubscribed or bounced.
insert into public.mail_suppressions (email, reason, detail)
select c.email,
       case when c.status = 'unsubscribed' then 'unsubscribed' else 'bounced' end,
       left(coalesce(c.bounce_reason, 'histórico'), 500)
from public.mail_contacts c
where c.status in ('unsubscribed', 'bounced')
on conflict (email) do nothing;

-- Keep it filled automatically from now on.
create or replace function public.mail_tg_suppress()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status in ('unsubscribed', 'bounced')
     and old.status is distinct from new.status then
    insert into public.mail_suppressions (email, reason, detail)
    values (new.email,
            case when new.status = 'unsubscribed' then 'unsubscribed' else 'bounced' end,
            left(coalesce(new.bounce_reason, new.last_error, ''), 500))
    on conflict (email) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists tg_mail_contacts_suppress on public.mail_contacts;
create trigger tg_mail_contacts_suppress
  after update of status on public.mail_contacts
  for each row execute function public.mail_tg_suppress();

-- ============================================================
-- 3. Sending-behaviour settings (window, jitter, retries, bot filter)
-- ============================================================
alter table public.mail_settings
  add column if not exists send_window_start      time    not null default '08:00',
  add column if not exists send_window_end        time    not null default '20:00',
  add column if not exists send_weekdays_only     boolean not null default false,
  add column if not exists jitter_seconds         integer not null default 20,
  add column if not exists open_min_delay_seconds integer not null default 60,
  add column if not exists max_attempts           integer not null default 3;

-- ============================================================
-- 4. Per-account pacing + incremental IMAP cursor
-- ============================================================
alter table public.mail_gmail_accounts
  add column if not exists min_interval_seconds integer not null default 0,
  add column if not exists last_scan_uid        bigint  not null default 0,
  add column if not exists scan_error           text;

-- ============================================================
-- 5. Contact-level: real opens vs proxy prefetch, retry backoff
-- ============================================================
alter table public.mail_contacts
  add column if not exists prefetch_count  integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

-- ============================================================
-- 6. Event taxonomy: separate proxy prefetch and unsubscribe
-- ============================================================
alter table public.mail_events drop constraint if exists mail_events_type_check;
alter table public.mail_events add constraint mail_events_type_check
  check (type in ('sent', 'open', 'prefetch', 'click', 'reply', 'bounce', 'failed', 'unsubscribe'));

-- ============================================================
-- 7. Indexes that matter at 23k+ contacts
-- ============================================================
create index if not exists idx_mail_contacts_claim
  on public.mail_contacts (campaign_id, created_at) where status = 'pending';
create index if not exists idx_mail_events_contact
  on public.mail_events (contact_id, type);
create index if not exists idx_mail_events_created
  on public.mail_events (created_at desc);
create index if not exists idx_mail_contacts_norm_status
  on public.mail_contacts (status);
