import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';
import { verifyAccount } from '@/lib/mailer';
import { encrypt } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').replace(/\s+/g, '');
  const display_name = String(body.display_name || '').trim();
  const signature_html = String(body.signature_html || '');
  const daily_limit = Number(body.daily_limit) || 400;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha de app são obrigatórios.' }, { status: 400 });
  }

  try {
    await verifyAccount(email, password);
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível autenticar no Gmail. Confira o email e a senha de app (com 2FA ativo).' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('mail_gmail_accounts')
    .insert({
      email,
      display_name,
      signature_html,
      app_password_enc: encrypt(password),
      daily_limit,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    const dup = error.message.toLowerCase().includes('duplicate') || error.code === '23505';
    return NextResponse.json(
      { error: dup ? 'Essa conta já foi conectada.' : error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ id: data.id });
}
