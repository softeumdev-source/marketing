import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export type ScanOutcome = {
  /** New messages whose envelope we looked at. */
  scanned: number;
  /** Messages we downloaded in full (bounce reports + mail from our contacts). */
  inspected: number;
  /** New cursor: every message up to this UID has been handled. */
  highestUid: number;
  /** True when there was more mail than this run could take. */
  truncated: boolean;
  bounces: { email: string; reason: string }[];
  replies: { email: string; snippet: string }[];
};

const DAEMON_RE = /(mailer-daemon|postmaster|mail delivery (subsystem|system))/i;
const DSN_SUBJECT_RE =
  /(delivery status notification|undelivered mail returned|delivery incomplete|failure notice|returned mail|delivery has failed|n[ãa]o foi entregue)/i;
const NOREPLY_RE = /(no-?reply|noreply|do-?not-?reply|mailer-daemon)/i;
const AUTOREPLY_SUBJECT_RE =
  /^(re:\s*)?(automatic reply|auto(matic)? response|out of office|resposta autom[áa]tica|mensagem autom[áa]tica|aus[êe]ncia|estou de f[ée]rias)/i;

function extractBounceRecipients(raw: string): string[] {
  const found = new Set<string>();
  // RFC 3464 delivery status report fields.
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

// An out-of-office bounce-back is not a real reply, and treating it as one
// would silently drop the contact from the campaign.
function isAutoReply(raw: string, subject: string): boolean {
  if (AUTOREPLY_SUBJECT_RE.test(subject.trim())) return true;
  return (
    /^auto-submitted:\s*auto-(replied|generated|notified)/im.test(raw) ||
    /^x-auto(reply|respond|generated)\s*:/im.test(raw) ||
    /^precedence:\s*(bulk|auto_reply|junk)/im.test(raw)
  );
}

/**
 * Reads only what is new.
 *
 * The previous implementation re-fetched the full source of the last 250
 * messages of the last 7 days on every run, for every account, every three
 * minutes — which never finished inside the function timeout, so bounce and
 * reply detection silently stopped working.
 *
 * This version keeps a per-account UID cursor and works in two phases:
 *   1. envelopes for all new messages (cheap);
 *   2. full source only for bounce reports and mail from known contacts.
 *
 * The cursor is only advanced past messages that were fully handled, so an
 * interrupted run is resumed rather than skipped.
 */
export async function scanAccountIncremental(opts: {
  user: string;
  pass: string;
  sinceUid: number;
  /** Absolute Date.now() budget for this account. */
  deadline: number;
  maxMessages?: number;
  maxCandidates?: number;
  filterKnown: (emails: string[]) => Promise<Set<string>>;
}): Promise<ScanOutcome> {
  const { user, pass, sinceUid, deadline, filterKnown } = opts;
  const maxMessages = opts.maxMessages ?? 200;
  const maxCandidates = opts.maxCandidates ?? 40;

  const out: ScanOutcome = {
    scanned: 0,
    inspected: 0,
    highestUid: sinceUid,
    truncated: false,
    bounces: [],
    replies: [],
  };

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
    let uids: number[];
    if (sinceUid > 0) {
      const found = (await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || [];
      // IMAP answers `n:*` with the last message even when its UID is below n.
      uids = (found as number[]).filter((u) => u > sinceUid);
    } else {
      // First run for this account: bootstrap over a short window instead of
      // walking the whole mailbox.
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      uids = ((await client.search({ since }, { uid: true })) || []) as number[];
    }

    uids.sort((a, b) => a - b);
    if (uids.length > maxMessages) {
      uids = uids.slice(0, maxMessages); // oldest first, so the cursor advances
      out.truncated = true;
    }
    if (!uids.length) return out;

    // ---- Phase 1: envelopes only -----------------------------------------
    type Head = { uid: number; from: string; subject: string };
    const heads: Head[] = [];
    for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
      heads.push({
        uid: msg.uid,
        from: (msg.envelope?.from?.[0]?.address || '').toLowerCase(),
        subject: msg.envelope?.subject || '',
      });
    }
    if (!heads.length) return out;
    out.scanned = heads.length;

    const maxHeadUid = heads.reduce((m, h) => (h.uid > m ? h.uid : m), sinceUid);

    const dsn = heads.filter(
      (h) =>
        DAEMON_RE.test(h.from) || DAEMON_RE.test(h.subject) || DSN_SUBJECT_RE.test(h.subject)
    );
    const dsnUids = new Set(dsn.map((h) => h.uid));

    // Anything else only matters if the sender is on one of our lists.
    const humans = heads.filter(
      (h) => !dsnUids.has(h.uid) && h.from && !NOREPLY_RE.test(h.from)
    );
    let known = new Set<string>();
    if (humans.length) {
      try {
        known = await filterKnown([...new Set(humans.map((h) => h.from))]);
      } catch {
        known = new Set(); // a lookup failure must not turn into a false reply
      }
    }

    let candidates = [...dsn, ...humans.filter((h) => known.has(h.from))].sort(
      (a, b) => a.uid - b.uid
    );

    if (!candidates.length) {
      out.highestUid = maxHeadUid; // nothing worth downloading; all handled
      return out;
    }

    if (Date.now() > deadline) {
      out.truncated = true; // cursor stays put, next run redoes this cheaply
      return out;
    }

    let capped = false;
    if (candidates.length > maxCandidates) {
      candidates = candidates.slice(0, maxCandidates);
      capped = true;
      out.truncated = true;
    }

    // ---- Phase 2: full source, only for the messages that matter ---------
    const bySubject = new Map(candidates.map((c) => [c.uid, c]));
    let lastHandledUid = sinceUid;

    for await (const msg of client.fetch(
      candidates.map((c) => c.uid),
      { source: true },
      { uid: true }
    )) {
      out.inspected++;
      const head = bySubject.get(msg.uid);
      const raw = msg.source ? msg.source.toString('utf8') : '';
      try {
        if (dsnUids.has(msg.uid)) {
          if (isHardBounce(raw)) {
            const reason = extractReason(raw);
            for (const rcpt of extractBounceRecipients(raw)) {
              out.bounces.push({ email: rcpt, reason });
            }
          }
        } else if (!isAutoReply(raw, head?.subject || '')) {
          const parsed = await simpleParser(msg.source as Buffer);
          const from = (parsed.from?.value?.[0]?.address || head?.from || '').toLowerCase();
          if (from) {
            const snippet = (parsed.text || parsed.subject || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 300);
            out.replies.push({ email: from, snippet });
          }
        }
      } catch {
        // Unparseable message: skip it, but still let the cursor pass it.
      }
      lastHandledUid = Math.max(lastHandledUid, msg.uid);
    }

    // Only claim progress up to what we actually handled. Re-examining a few
    // envelopes next run is harmless; skipping a bounce is not.
    out.highestUid = capped ? lastHandledUid : maxHeadUid;
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  return out;
}
