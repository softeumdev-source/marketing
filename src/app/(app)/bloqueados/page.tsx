import { createClient } from '@/lib/supabase-server';
import { PageHeader, StatCard, fmtInt } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  unsubscribed: 'Cancelou a inscrição',
  bounced: 'Email inválido',
  complaint: 'Marcou como spam',
  manual: 'Bloqueio manual',
};

const REASON_COLOR: Record<string, string> = {
  unsubscribed: 'bg-slate-100 text-slate-600',
  bounced: 'bg-red-100 text-red-700',
  complaint: 'bg-amber-100 text-amber-700',
  manual: 'bg-slate-100 text-slate-600',
};

export default async function BlockedPage() {
  const supabase = createClient();

  const { data: rows } = await supabase
    .from('mail_suppressions')
    .select('email,reason,detail,created_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  const { count: total } = await supabase
    .from('mail_suppressions')
    .select('*', { count: 'exact', head: true });

  const list = rows ?? [];
  const byReason = list.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Lista de bloqueio"
        subtitle="Endereços que nunca voltam a receber email. A importação recusa esses endereços automaticamente, mesmo que a campanha antiga seja excluída."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total bloqueado" value={fmtInt(total ?? 0)} accent="text-red-600" />
        <StatCard label="Emails inválidos" value={fmtInt(byReason.bounced ?? 0)} />
        <StatCard label="Cancelaram inscrição" value={fmtInt(byReason.unsubscribed ?? 0)} />
        <StatCard label="Bloqueios manuais" value={fmtInt(byReason.manual ?? 0)} />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
          {list.length >= 2000
            ? 'Mostrando os 2.000 bloqueios mais recentes'
            : `${fmtInt(list.length)} registro(s)`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Email</th>
                <th className="px-5 py-2 text-left font-medium">Motivo</th>
                <th className="px-5 py-2 text-left font-medium">Detalhe</th>
                <th className="px-5 py-2 text-left font-medium">Desde</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.email} className="border-t border-slate-50">
                  <td className="px-5 py-2 text-slate-700">{r.email}</td>
                  <td className="px-5 py-2">
                    <span className={`badge ${REASON_COLOR[r.reason] ?? 'bg-slate-100 text-slate-600'}`}>
                      {REASON_LABEL[r.reason] ?? r.reason}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-5 py-2 text-xs text-slate-500">
                    {r.detail || '—'}
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                    Nenhum endereço bloqueado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
