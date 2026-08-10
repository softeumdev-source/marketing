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
  track_opens: boolean;
  account_id: string;
  account_email: string;
  account_password_enc: string;
  account_display_name: string;
  account_signature: string;
};

export type ScanAccount = {
  id: string;
  email: string;
  app_password_enc: string;
  last_scan_uid: number | null;
  last_scan_at: string | null;
};

/**
 * Seconds until the next e-mail may go out.
 *  - `null` means there is nothing to send at all right now (queue empty,
 *    campaign paused, daily cap reached or outside the sending window), so the
 *    worker can return immediately instead of holding the function open.
 *  - `0` means a send is due now.
 */
export async function nextReadyIn(): Promise<number | null> {
  const sb = createAnonClient();
  const { data, error } = await sb.rpc('mail_next_ready_in', { p_secret: WORKER_SECRET });
  if (error) throw new Error(error.message);
  return data === null || data === undefined ? null : Number(data);
}

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

/** Active accounts, least-recently-scanned first (round-robin friendly). */
export async function scanAccounts(): Promise<ScanAccount[]> {
  const sb = createAnonClient();
  const { data, error } = await sb.rpc('mail_scan_accounts', { p_secret: WORKER_SECRET });
  if (error) throw new Error(error.message);
  return (data as ScanAccount[]) || [];
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

/**
 * Persists the IMAP cursor for an account. Passing `uid` moves the cursor
 * forward so the next scan only reads new messages; passing `error` records
 * why a scan failed (and still advances `last_scan_at`, so one broken account
 * cannot starve the others).
 */
export async function touchScan(
  accountId: string,
  uid?: number | null,
  error?: string | null
): Promise<void> {
  const sb = createAnonClient();
  await sb.rpc('mail_touch_scan', {
    p_secret: WORKER_SECRET,
    p_account_id: accountId,
    p_uid: uid ?? null,
    p_error: error ?? null,
  });
}

/** Narrows a list of inbound senders down to addresses that are our contacts. */
export async function knownContacts(emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const sb = createAnonClient();
  const { data, error } = await sb.rpc('mail_known_contacts', {
    p_secret: WORKER_SECRET,
    p_emails: emails,
  });
  if (error) throw new Error(error.message);
  return new Set(((data as { email: string }[]) || []).map((r) => r.email.toLowerCase()));
}
