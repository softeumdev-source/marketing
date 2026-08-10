-- Adds unsubscribed / retry / proxy-prefetch visibility per campaign.
-- New columns are appended so CREATE OR REPLACE keeps the existing positions.
create or replace view public.mail_campaign_stats
with (security_invoker = on) as
select
  c.id as campaign_id,
  count(ct.id)                                            as total,
  count(*) filter (where ct.status = 'pending')            as pending,
  count(*) filter (where ct.status in ('sent', 'replied'))  as sent,
  count(*) filter (where ct.open_count > 0)                as opened,
  count(*) filter (where ct.status = 'replied')            as replied,
  count(*) filter (where ct.status = 'bounced')            as bounced,
  count(*) filter (where ct.status = 'failed')             as failed,
  count(*) filter (where ct.status = 'pending'
                     and ct.next_attempt_at > now())       as retry_queued,
  count(*) filter (where ct.status = 'sending')            as sending,
  count(*) filter (where ct.status = 'unsubscribed')       as unsubscribed,
  coalesce(sum(ct.prefetch_count), 0)                      as prefetch
from public.mail_campaigns c
left join public.mail_contacts ct on ct.campaign_id = c.id
group by c.id;
