-- Política de envio: horário comercial, dias úteis. Os defaults iniciais
-- (08:00-20:00, todos os dias) permitiam disparo de madrugada e no fim de
-- semana. Ajusta os defaults da coluna para que uma instalação nova já nasça
-- com a política correta, e não só a linha atual.
alter table public.mail_settings
  alter column send_window_start   set default '08:00',
  alter column send_window_end     set default '18:00',
  alter column send_weekdays_only  set default true;

-- Garante a linha em uso (id = 1).
update public.mail_settings
   set send_window_start  = '08:00',
       send_window_end    = '18:00',
       send_weekdays_only = true,
       updated_at         = now()
 where id = 1;
