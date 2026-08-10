import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/require-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type ImportResult = {
  total: number;
  inserted: number;
  invalid: number;
  duplicates_in_file: number;
  already_in_system: number;
  suppressed: number;
};

/**
 * Import is a single set-based call to `mail_import_contacts`, which dedupes
 * and inserts atomically. The previous version issued one SELECT per 400
 * addresses just to look for duplicates (≈60 round trips for a 23k list) and
 * could not report *why* a row was skipped.
 *
 * Duplicates are blocked at three levels:
 *   1. inside the uploaded batch     — collapsed by normalised address
 *   2. anywhere else in the system   — unique index on email and email_norm
 *   3. previously unsubscribed/bounced — permanent suppression list
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { contacts?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const rows = Array.isArray(body.contacts) ? body.contacts : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhum contato recebido.' }, { status: 400 });
  }
  if (rows.length > 20000) {
    return NextResponse.json(
      { error: 'Lote muito grande. Envie até 20.000 contatos por requisição.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc('mail_import_contacts', {
    p_campaign: params.id,
    p_rows: rows,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as ImportResult);
}
