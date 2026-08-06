import { createAnonClient } from './supabase-anon';
import { WORKER_SECRET } from './secrets';

export type ClaimRow = {
  contact_id: string;
  contact_email: string;
  contact_name: string;
  tracking_id: string;
  campaign_id: string;
  subject: string;
  body_html: string;
  from_name: string;
  account_id: string;
  account_email: string;
  account_password_enc: string;
  account_display_name: string;
};

export async function claimNext(): Promise<ClaimRow | null> {
  const sb = createAnonClient();
  const { data, error } = await sb.rpc('mail_claim_next', { p_secret: WORKER_SECRET });
  if (error) throw new Error(error.message);
  return (data && (data as ClaimRow[])[0]) || null;
}

export async function markSent(contactId: string, messageId: string): Promise<void> {
  const sb = createAnonClient();
  const { error } = await sb.rpc('mail_mark_sent', {
    p_secret: WORKER_SECRET,
    p_contact_id: contactId,
    p_message_id: messageId,
  });
  if (error) throw new Error(error.message);
}

export async function markFailed(contactId: string, err: string): Promise<void> {
  const sb = createAnonClient();
  await sb.rpc('mail_mark_failed', {
    p_secret: WORKER_SECRET,
    p_contact_id: contactId,
    p_error: err,
  });
}

export async function scanAccounts(): Promise<
  { id: string; email: string; app_password_enc: string }[]
> {
  const sb = createAnonClient();
  const { data, error } = await sb.rpc('mail_scan_accounts', { p_secret: WORKER_SECRET });
  if (error) throw new Error(error.message);
  return (data as { id: string; email: string; app_password_enc: string }[]) || [];
}

export async function markBounced(email: string, reason: string): Promise<number> {
  const sb = createAnonClient();
  const { data } = await sb.rpc('mail_mark_bounced_by_email', {
    p_secret: WORKER_SECRET,
    p_email: email,
    p_reason: reason,
  });
  return (data as number) || 0;
}

export async function markReplied(email: string, snippet: string): Promise<number> {
  const sb = createAnonClient();
  const { data } = await sb.rpc('mail_mark_replied_by_email', {
    p_secret: WORKER_SECRET,
    p_email: email,
    p_snippet: snippet,
  });
  return (data as number) || 0;
}

export async function touchScan(accountId: string): Promise<void> {
  const sb = createAnonClient();
  await sb.rpc('mail_touch_scan', { p_secret: WORKER_SECRET, p_account_id: accountId });
}
