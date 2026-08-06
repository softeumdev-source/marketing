import { NextResponse } from 'next/server';
import { WORKER_SECRET } from '@/lib/secrets';
import { scanAccounts, markBounced, markReplied, touchScan } from '@/lib/worker-db';
import { decrypt } from '@/lib/crypto';
import { scanAccount } from '@/lib/imap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  let accounts: { id: string; email: string; app_password_enc: string }[] = [];
  try {
    accounts = await scanAccounts();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  let bounced = 0;
  let replied = 0;

  for (const a of accounts) {
    try {
      const pass = decrypt(a.app_password_enc);
      const res = await scanAccount(a.email, pass);
      for (const b of res.bounces) bounced += await markBounced(b.email, b.reason);
      for (const r of res.replies) replied += await markReplied(r.email, r.snippet);
      await touchScan(a.id);
    } catch {
      // skip account on connection/parse errors
    }
  }

  return NextResponse.json({ accounts: accounts.length, bounced, replied });
}

export const GET = handle;
export const POST = handle;
