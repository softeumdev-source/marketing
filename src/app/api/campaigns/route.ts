import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const name = String(body.name || '').trim();
  const subject = String(body.subject || '').trim();
  const body_html = String(body.body_html || '');
  if (!name || !subject || !body_html) {
    return NextResponse.json({ error: 'Nome, assunto e mensagem são obrigatórios.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('mail_campaigns')
    .insert({
      name,
      subject,
      body_html,
      from_name: String(body.from_name || '').trim(),
      daily_limit: Number(body.daily_limit) || 200,
      send_interval_seconds: Math.max(1, Number(body.send_interval_seconds) || 90),
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
