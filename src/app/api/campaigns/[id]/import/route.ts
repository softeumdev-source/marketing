import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const raw: { nome?: string; email?: string }[] = Array.isArray(body.contacts) ? body.contacts : [];

  // Normalize + validate + dedupe within the incoming payload.
  const byEmail = new Map<string, string>(); // email -> name
  let invalid = 0;
  for (const r of raw) {
    const email = String(r.email || '').trim().toLowerCase();
    const name = String(r.nome || '').trim();
    if (!EMAIL_RE.test(email)) {
      invalid++;
      continue;
    }
    if (!byEmail.has(email)) byEmail.set(email, name);
  }

  const emails = [...byEmail.keys()];
  if (emails.length === 0) {
    return NextResponse.json({ inserted: 0, duplicates: 0, invalid });
  }

  // Find which emails already exist anywhere in the system (global uniqueness).
  const existing = new Set<string>();
  for (const part of chunk(emails, 400)) {
    const { data, error } = await supabase
      .from('mail_contacts')
      .select('email')
      .in('email', part);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    for (const row of data ?? []) existing.add(String(row.email).toLowerCase());
  }

  const toInsert = emails
    .filter((e) => !existing.has(e))
    .map((email) => ({ campaign_id: params.id, email, name: byEmail.get(email) || '' }));

  let inserted = 0;
  for (const part of chunk(toInsert, 500)) {
    // ignoreDuplicates guards against races on the unique index.
    const { data, error } = await supabase
      .from('mail_contacts')
      .upsert(part, { onConflict: 'email', ignoreDuplicates: true })
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    inserted += data?.length ?? 0;
  }

  const duplicates = emails.length - inserted;
  return NextResponse.json({ inserted, duplicates, invalid });
}
