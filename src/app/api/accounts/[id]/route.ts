import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.status && ['active', 'paused'].includes(body.status)) {
    update.status = body.status;
    update.last_error = null;
  }
  if (typeof body.daily_limit === 'number') update.daily_limit = body.daily_limit;
  if (typeof body.signature_html === 'string') update.signature_html = body.signature_html;

  const { error } = await supabase.from('mail_gmail_accounts').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await supabase.from('mail_gmail_accounts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
