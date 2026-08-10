-- Concorrentes e dominios que nunca devem receber e-mail, no nivel de dominio.
-- A blocklist de e-mail individual nao resolve: um endereco novo de
-- neogrid.com entraria na proxima importacao.
create table if not exists public.mail_blocked_domains (
  domain     text primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.mail_blocked_domains enable row level security;

drop policy if exists p_auth_all on public.mail_blocked_domains;
create policy p_auth_all on public.mail_blocked_domains
  for all to authenticated using (true) with check (true);

revoke all on public.mail_blocked_domains from public, anon;
grant select, insert, update, delete on public.mail_blocked_domains to authenticated;

insert into public.mail_blocked_domains (domain, note) values
  ('neogrid.com',    'concorrente'),
  ('neogrid.com.br', 'concorrente'),
  ('neogrid.net',    'concorrente'),
  ('totvs.com',      'concorrente'),
  ('totvs.com.br',   'concorrente'),
  ('totva.com.br',   'erro de digitacao de totvs.com.br')
on conflict (domain) do nothing;

-- Casa o dominio exato e qualquer subdominio (mail.neogrid.com).
create or replace function public.mail_domain_blocked(p_email text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.mail_blocked_domains b
    where split_part(lower(coalesce(p_email, '')), '@', 2) = b.domain
       or split_part(lower(coalesce(p_email, '')), '@', 2) like '%.' || b.domain
  );
$$;

revoke all on function public.mail_domain_blocked(text) from public, anon;
grant execute on function public.mail_domain_blocked(text) to authenticated;

-- Ultima linha de defesa: nem um insert direto passa.
create or replace function public.mail_tg_block_domain()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.mail_domain_blocked(new.email::text) then
    raise exception 'dominio bloqueado: %', split_part(lower(new.email::text), '@', 2)
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_mail_block_domain on public.mail_contacts;
create trigger trg_mail_block_domain
  before insert or update of email on public.mail_contacts
  for each row execute function public.mail_tg_block_domain();
