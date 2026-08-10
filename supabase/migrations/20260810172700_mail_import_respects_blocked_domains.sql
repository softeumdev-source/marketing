-- A importacao precisa descartar dominio bloqueado em silencio e contabilizar,
-- em vez de estourar a excecao do trigger e derrubar o lote inteiro.
create or replace function public.mail_import_contacts(p_campaign uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_total int; v_valid int; v_uniq int;
  v_suppressed int; v_existing int; v_inserted int; v_blocked int;
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
      and not public.mail_domain_blocked(u.email)
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
         (select count(*) from ins),
         (select count(*) from uniq u where public.mail_domain_blocked(u.email))
    into v_valid, v_uniq, v_suppressed, v_existing, v_inserted, v_blocked;

  return jsonb_build_object(
    'total',              v_total,
    'inserted',           v_inserted,
    'invalid',            v_total - v_valid,
    'duplicates_in_file', v_valid - v_uniq,
    'already_in_system',  v_existing,
    'suppressed',         v_suppressed,
    'blocked_domain',     v_blocked
  );
end $function$;

revoke all on function public.mail_import_contacts(uuid, jsonb) from public, anon;
grant execute on function public.mail_import_contacts(uuid, jsonb) to authenticated;
