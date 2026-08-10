-- Gmail/Outlook fetch the tracking pixel through their image proxy the moment
-- the message lands, long before a human looks at it. Those hits were being
-- counted as real opens, which inflated the open rate ~6x.
-- Reclassify anything that fired within 60s of the send as 'prefetch'.
update public.mail_events e
set type = 'prefetch'
from public.mail_contacts c
where c.id = e.contact_id
  and e.type = 'open'
  and c.sent_at is not null
  and e.created_at - c.sent_at < interval '60 seconds';

-- Unsubscribes were being logged as 'failed', polluting the failure metric.
update public.mail_events
set type = 'unsubscribe'
where type = 'failed' and (meta ->> 'unsubscribed') = 'true';

-- Recompute the per-contact counters from the corrected event log.
update public.mail_contacts c set
  open_count     = coalesce((select count(*) from public.mail_events e
                              where e.contact_id = c.id and e.type = 'open'), 0),
  prefetch_count = coalesce((select count(*) from public.mail_events e
                              where e.contact_id = c.id and e.type = 'prefetch'), 0),
  opened_at      = (select min(created_at) from public.mail_events e
                     where e.contact_id = c.id and e.type = 'open'),
  last_open_at   = (select max(created_at) from public.mail_events e
                     where e.contact_id = c.id and e.type = 'open')
where exists (select 1 from public.mail_events e
              where e.contact_id = c.id and e.type in ('open', 'prefetch'));
