import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();

  // Re-run: requeue everyone who was already sent/failed and start again.
  // Leaves bounced / invalid / replied / unsubscribed contacts out (never re-mailed).
  if (body.action === 'restart') {
    await supabase
      .from('mail_contacts')
      .update({
        status: 'pending',
        sent_at: null,
        opened_at: null,
        last_open_at: null,
        open_count: 0,
        attempts: 0,
        message_id: null,
        last_error: null,
      })
      .eq('campaign_id', params.id)
      .in('status', ['sent', 'failed']);

    const { error } = await supabase
      .from('mail_campaigns')
      .update({ status: 'running', sent_count: 0, updated_at: new Date().toISOString() })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.action === 'start' || body.action === 'resume') update.status = 'running';
  else if (body.action === 'pause') update.status = 'paused';
  else {
    for (const f of ['name', 'subject', 'body_html', 'from_name']) {
      if (typeof body[f] === 'string') update[f] = body[f];
    }
    if (typeof body.daily_limit === 'number') update.daily_limit = body.daily_limit;
    if (typeof body.send_interval_seconds === 'number')
      update.send_interval_seconds = Math.max(1, body.send_interval_seconds);
    if (typeof body.track_opens === 'boolean') update.track_opens = body.track_opens;
  }

  const { error } = await supabase.from('mail_campaigns').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Delete contacts first so their (globally unique) emails are freed for reuse.
  await supabase.from('mail_contacts').delete().eq('campaign_id', params.id);
  const { error } = await supabase.from('mail_campaigns').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
