import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { StatCard, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function count(
  supabase: ReturnType<typeof createClient>,
  build: (q: any) => any
): Promise<number> {
  const q = build(supabase.from('mail_contacts').select('*', { count: 'exact', head: true }));
  const { count } = await q;
  return count ?? 0;
}

export default async function Dashboard() {
  const supabase = createClient();

  const [total, sent, opened, replied, bounced, pending] = await Promise.all([
    count(supabase, (q) => q),
    count(supabase, (q) => q.in('status', ['sent', 'replied'])),
    count(supabase, (q) => q.gt('open_count', 0)),
    count(supabase, (q) => q.eq('status', 'replied')),
    count(supabase, (q) => q.eq('status', 'bounced')),
    count(supabase, (q) => q.eq('status', 'pending')),
  ]);

  const { data: accounts } = await supabase
    .from('mail_gmail_accounts')
    .select('id,email,status,sent_today,daily_limit');

  const { data: campaigns } = await supabase
    .from('mail_campaigns')
    .select('id,name,status,sent_count,daily_limit,sent_today')
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: opens } = await supabase
    .from('mail_events')
    .select('created_at, mail_contacts(email,name), mail_campaigns(name)')
    .eq('type', 'open')
    .order('created_at', { ascending: false })
    .limit(8);

  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active').length;
  const sentToday = (accounts ?? []).reduce((s, a) => s + (a.sent_today ?? 0), 0);

  return (
    <div>
      <PageHeader title="Painel" subtitle="Visão geral das suas campanhas de email" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Contatos" value={total} hint={`${pending} na fila`} />
        <StatCard label="Enviados" value={sent} hint={`${sentToday} hoje`} accent="text-blue-600" />
        <StatCard label="Aberturas" value={opened} hint={`${openRate}% de abertura`} accent="text-green-600" />
        <StatCard label="Responderam" value={replied} accent="text-green-700" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <StatCard label="Inválidos (bounce)" value={bounced} accent="text-red-600" />
        <StatCard label="Contas Gmail ativas" value={activeAccounts} hint={`${accounts?.length ?? 0} no total`} />
        <div className="card p-5 col-span-2 flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Comece agora</div>
            <div className="text-slate-800 font-semibold">Crie uma campanha e importe sua lista</div>
          </div>
          <Link href="/campaigns" className="btn-primary">Nova campanha</Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Campanhas recentes</h2>
          {(campaigns ?? []).length === 0 && (
            <p className="text-sm text-slate-400">Nenhuma campanha ainda.</p>
          )}
          <div className="space-y-2">
            {(campaigns ?? []).map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{c.name}</span>
                <span className="text-sm text-slate-500">{c.sent_count} enviados</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Últimas aberturas</h2>
          {(opens ?? []).length === 0 && (
            <p className="text-sm text-slate-400">Ninguém abriu ainda.</p>
          )}
          <div className="space-y-2">
            {(opens ?? []).map((o: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-700 truncate">
                    {o.mail_contacts?.name || o.mail_contacts?.email || 'Contato'}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {o.mail_campaigns?.name}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{fmtDate(o.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
