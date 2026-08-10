import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('mail_get_settings');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const payload: Record<string, unknown> = {};
  if (typeof body.timezone === 'string') payload.timezone = body.timezone;
  if (typeof body.send_window_start === 'string') payload.send_window_start = body.send_window_start;
  if (typeof body.send_window_end === 'string') payload.send_window_end = body.send_window_end;
  if (typeof body.send_weekdays_only === 'boolean')
    payload.send_weekdays_only = body.send_weekdays_only;
  if (typeof body.jitter_seconds === 'number') payload.jitter_seconds = body.jitter_seconds;
  if (typeof body.open_min_delay_seconds === 'number')
    payload.open_min_delay_seconds = body.open_min_delay_seconds;
  if (typeof body.max_attempts === 'number') payload.max_attempts = body.max_attempts;

  const { data, error } = await supabase.rpc('mail_update_settings', { p: payload });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
