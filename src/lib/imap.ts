import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export type ScanResult = {
  bounces: { email: string; reason: string }[];
  replies: { email: string; snippet: string }[];
  scanned: number;
};

const DAEMON_RE = /(mailer-daemon|postmaster|mail delivery subsystem)/i;

function extractBounceRecipients(raw: string): string[] {
  const found = new Set<string>();
  // RFC 3464 delivery status report field.
  const finalRe = /Final-Recipient:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/gi;
  const origRe = /Original-Recipient:\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/gi;
  const xfailRe = /X-Failed-Recipients:\s*([^\s<>]+@[^\s<>]+)/gi;
  for (const re of [finalRe, origRe, xfailRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) found.add(m[1].trim().toLowerCase());
  }
  return [...found];
}

function extractReason(raw: string): string {
  const diag = /Diagnostic-Code:\s*smtp;\s*([^\n\r]+)/i.exec(raw);
  if (diag) return diag[1].trim().slice(0, 300);
  const five = /((?:5\d\d)[ -]5\.\d\.\d[^\n\r]+)/.exec(raw);
  if (five) return five[1].trim().slice(0, 300);
  return 'Endereço inexistente ou caixa indisponível';
}

function isHardBounce(raw: string): boolean {
  return /5\.1\.1|5\.1\.10|5\.5\.0|does not exist|user unknown|no such user|address rejected|recipient rejected|mailbox unavailable|account that you tried to reach/i.test(
    raw
  );
}

export async function scanAccount(user: string, pass: string): Promise<ScanResult> {
  const result: ScanResult = { bounces: [], replies: [], scanned: 0 };
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    let uids = (await client.search({ since }, { uid: true })) || [];
    if (!uids.length) return result;
    if (uids.length > 250) uids = uids.slice(-250);

    for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
      try {
        result.scanned++;
        const raw = msg.source ? msg.source.toString('utf8') : '';
        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddr =
          parsed.from?.value?.[0]?.address?.toLowerCase() ||
          (Array.isArray(parsed.from) ? '' : '');
        const subject = parsed.subject || '';
        const isReport =
          DAEMON_RE.test(fromAddr) ||
          DAEMON_RE.test(subject) ||
          /content-type:\s*multipart\/report/i.test(raw) ||
          /Delivery Status Notification|Undelivered Mail Returned|Delivery incomplete|failure notice/i.test(
            subject
          );

        if (isReport && isHardBounce(raw)) {
          const reason = extractReason(raw);
          for (const rcpt of extractBounceRecipients(raw)) {
            result.bounces.push({ email: rcpt, reason });
          }
          continue;
        }

        // Genuine reply from a real person.
        if (fromAddr && !DAEMON_RE.test(fromAddr) && !fromAddr.includes('no-reply') && !fromAddr.includes('noreply')) {
          const snippet = (parsed.text || parsed.subject || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300);
          result.replies.push({ email: fromAddr, snippet });
        }
      } catch {
        // skip messages that fail to parse
      }
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return result;
}
