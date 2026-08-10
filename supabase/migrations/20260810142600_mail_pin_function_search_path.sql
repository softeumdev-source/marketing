-- Pin search_path on the new functions (Supabase linter 0011).
-- All three reference only pg_catalog built-ins or public.-qualified objects.
alter function public.mail_norm_email(text)               set search_path to 'public';
alter function public.mail_jitter(uuid, timestamptz, int) set search_path to 'public';
alter function public.mail_import_contacts(uuid, jsonb)   set search_path to 'public';
