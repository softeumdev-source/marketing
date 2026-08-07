import { NextResponse } from 'next/server';
import { WORKER_SECRET } from '@/lib/secrets';
import { createAnonClient } from '@/lib/supabase-anon';
import rows from '@/data/soft-contacts.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-off, secret-gated bulk import of the bundled contact list into a campaign.
// Trigger via pg_net with x-cron-secret. Remove after use.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret =
    req.headers.get('x-cron-secret') || url.searchParams.get('key') || '';
  if (secret !== WORKER_SECRET) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const campaign = url.searchParams.get('campaign');
  if (!campaign) return NextResponse.json({ error: 'missing campaign' }, { status: 400 });

  const data = rows as { email: string; nome: string }[];
  const sb = createAnonClient();
  const CHUNK = 3000;
  let inserted = 0;
  for (let i = 0; i < data.length; i += CHUNK) {
    const part = data.slice(i, i + CHUNK);
    const { data: n, error } = await sb.rpc('mail_bulk_import', {
      p_secret: WORKER_SECRET,
      p_campaign: campaign,
      p_rows: part,
    });
    if (error) return NextResponse.json({ error: error.message, insertedSoFar: inserted }, { status: 500 });
    inserted += (n as number) || 0;
  }

  return NextResponse.json({ total: data.length, inserted });
}
