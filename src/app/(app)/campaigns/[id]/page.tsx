import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { StatusBadge } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import ImportPanel from '@/components/ImportPanel';
import CampaignControls from '@/components/CampaignControls';

export const dynamic = 'force-dynamic';

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from('mail_campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!campaign) notFound();

  const { data: statsRow } = await supabase
    .from('mail_campaign_stats')
    .select('*')
    .eq('campaign_id', params.id)
    .single();
  const s: any = statsRow ?? {};

  const { data: contacts } = await supabase
    .from('mail_contacts')
    .select('id,name,email,status,open_count,sent_at,opened_at,replied_at,reply_snippet,bounce_reason')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: true })
    .limit(500);

  const stat = (label: string, value: any, cls = 'text-slate-900') => (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value ?? 0}</div>
    </div>
  );

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-slate-400 hover:text-slate-600">← Campanhas</Link>

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Assunto: <span className="text-slate-700">{campaign.subject}</span>
          </p>
        </div>
        <CampaignControls campaign={campaign} pending={s.pending ?? 0} sentCount={s.sent ?? 0} />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {stat('Total', s.total)}
        {stat('Na fila', s.pending, 'text-slate-700')}
        {stat('Enviados', s.sent, 'text-blue-600')}
        {stat('Aberturas', s.opened, 'text-green-600')}
        {stat('Respostas', s.replied, 'text-green-700')}
        {stat('Inválidos', s.bounced, 'text-red-600')}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-2">Configuração de envio</h2>
          <dl className="text-sm space-y-1 text-slate-600">
            <div className="flex justify-between"><dt>Remetente</dt><dd className="text-slate-800">{campaign.from_name || '—'}</dd></div>
            <div className="flex justify-between"><dt>Limite por dia</dt><dd className="text-slate-800">{campaign.daily_limit}</dd></div>
            <div className="flex justify-between"><dt>Intervalo entre envios</dt><dd className="text-slate-800">{campaign.send_interval_seconds}s</dd></div>
            <div className="flex justify-between"><dt>Enviados hoje</dt><dd className="text-slate-800">{campaign.sent_today}</dd></div>
          </dl>
          <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 whitespace-pre-wrap max-h-32 overflow-auto">
            {campaign.body_html}
          </div>
        </div>
        <ImportPanel campaignId={campaign.id} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-900">
          Contatos ({s.total ?? 0}){(s.total ?? 0) > 500 ? ' — mostrando os 500 primeiros' : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-5 py-2">Nome</th>
                <th className="text-left font-medium px-5 py-2">Email</th>
                <th className="text-left font-medium px-5 py-2">Status</th>
                <th className="text-center font-medium px-5 py-2">Aberturas</th>
                <th className="text-left font-medium px-5 py-2">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-50">
                  <td className="px-5 py-2 text-slate-700">{c.name || '—'}</td>
                  <td className="px-5 py-2 text-slate-600">{c.email}</td>
                  <td className="px-5 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-2 text-center">
                    {c.open_count > 0 ? (
                      <span className="badge bg-green-100 text-green-700">👁 {c.open_count}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-slate-400 text-xs">{fmtDate(c.sent_at)}</td>
                </tr>
              ))}
              {(contacts ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Nenhum contato ainda. Importe sua lista acima.
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
