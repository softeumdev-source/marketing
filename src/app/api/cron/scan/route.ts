import { NextResponse } from 'next/server';
import { WORKER_SECRET } from '@/lib/secrets';
import {
  scanAccounts,
  markBounced,
  markReplied,
  touchScan,
  knownContacts,
} from '@/lib/worker-db';
import { decrypt } from '@/lib/crypto';
import { scanAccountIncremental } from '@/lib/imap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The caller (pg_net) gives up at 55s and Vercel kills the function at 60s, so
// the whole request has to land well inside that. 28s leaves room for a slow
// IMAP handshake on the last account without overrunning either limit.
const BUDGET_MS = 28_000;
// Don't start another account unless there is enough time to do something useful
// with it — starting one with a couple of seconds left is how a run overruns.
const PER_ACCOUNT_MIN_MS = 12_000;

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    url.searchParams.get('key') ||
    '';
  return provided === WORKER_SECRET;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const deadline = started + BUDGET_MS;

  let accounts;
  try {
    accounts = await scanAccounts();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  let bounced = 0;
  let replied = 0;
  const details: unknown[] = [];

  // Accounts arrive least-recently-scanned first, so if we run out of time the
  // ones we skipped are the first to be picked up next run.
  for (const a of accounts) {
    if (Date.now() > deadline - PER_ACCOUNT_MIN_MS) {
      details.push({ email: a.email, skipped: 'sem tempo nesta rodada' });
      continue;
    }

    const accountStarted = Date.now();
    try {
      const pass = decrypt(a.app_password_enc);
      const res = await scanAccountIncremental({
        user: a.email,
        pass,
        sinceUid: a.last_scan_uid ?? 0,
        deadline,
        filterKnown: knownContacts,
      });

      let matchedBounces = 0;
      let matchedReplies = 0;
      for (const b of res.bounces) matchedBounces += await markBounced(b.email, b.reason);
      for (const r of res.replies) matchedReplies += await markReplied(r.email, r.snippet);
      bounced += matchedBounces;
      replied += matchedReplies;

      await touchScan(a.id, res.highestUid, null);

      details.push({
        email: a.email,
        ok: true,
        ms: Date.now() - accountStarted,
        novos: res.scanned,
        baixados: res.inspected,
        bouncesEncontrados: res.bounces.length,
        bouncesAplicados: matchedBounces,
        respostasEncontradas: res.replies.length,
        respostasAplicadas: matchedReplies,
        cursor: res.highestUid,
        truncado: res.truncated,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Record the failure and still move last_scan_at forward, so a single
      // broken account cannot starve the others in the round-robin.
      await touchScan(a.id, null, msg).catch(() => {});
      details.push({ email: a.email, ok: false, ms: Date.now() - accountStarted, error: msg });
    }
  }

  return NextResponse.json({
    accounts: accounts.length,
    bounced,
    replied,
    ms: Date.now() - started,
    details,
  });
}

export const GET = handle;
export const POST = handle;
