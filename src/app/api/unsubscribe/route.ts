import { createAnonClient } from '@/lib/supabase-anon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function unsubscribe(tracking: string | null) {
  if (!tracking) return;
  try {
    const sb = createAnonClient();
    await sb.rpc('mail_unsubscribe', { p_tracking: tracking });
  } catch {
    /* ignore */
  }
}

const PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Descadastrado</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;margin:0"><div style="max-width:440px;margin:80px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;text-align:center"><div style="font-size:40px">✅</div><h2 style="color:#0f172a">Pronto!</h2><p style="color:#475569">Você foi descadastrado e não receberá mais estes emails.</p></div></body></html>`;

export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get('c');
  await unsubscribe(c);
  return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// One-Click unsubscribe (RFC 8058) sends a POST to the List-Unsubscribe URL.
export async function POST(req: Request) {
  const c = new URL(req.url).searchParams.get('c');
  await unsubscribe(c);
  return new Response(null, { status: 204 });
}
