import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { StatusBadge, Meter, Banner, fmtInt } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import ImportPanel from '@/components/ImportPanel';
import CampaignControls from '@/components/CampaignControls';

export const dynamic = 'force-dynamic';

type Stats = {
  total: number;
  pending: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  failed: number;
  retry_queued: number;
  sending: number;
  unsubscribed: number;
  prefetch: number;
};

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from('mail_campaigns')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!campaign) notFound();

  const [{ data: statsRow }, { data: contacts }, { data: accounts }, { count: sentLast24h }] =
    await Promise.all([
      supabase.from('mail_campaign_stats').select('*').eq('campaign_id', params.id).single(),
      supabase
        .from('mail_contacts')
        .select(
          'id,name,email,status,open_count,prefetch_count,sent_at,opened_at,replied_at,reply_snippet,bounce_reason,last_error,next_attempt_at'
        )
        .eq('campaign_id', params.id)
        .order('created_at', { ascending: true })
        .limit(500),
      supabase.from('mail_gmail_accounts').select('id,email,status').order('created_at'),
      supabase
        .from('mail_events')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', params.id)
        .eq('type', 'sent')
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    ]);

  const s = (statsRow ?? {}) as Partial<Stats>;
  const total = s.total ?? 0;
  const pending = s.pending ?? 0;
  const sent = s.sent ?? 0;
  const done = total - pending;

  const sendAccount = campaign.gmail_account_id
    ? (accounts ?? []).find((a) => a.id === campaign.gmail_account_id)?.email || 'conta removida'
    : 'Todas as contas ativas';

  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active').length;

  // Throughput ceiling: one send per interval per eligible account.
  const perDayCeiling = campaign.gmail_account_id
    ? Math.floor(86400 / Math.max(campaign.send_interval_seconds, 1))
    : Math.floor(86400 / Math.max(campaign.send_interval_seconds, 1)) * Math.max(activeAccounts, 1);
  const effectiveDaily = Math.min(campaign.daily_limit, perDayCeiling);
  const daysLeft = effectiveDaily > 0 ? Math.ceil(pending / effectiveDaily) : null;

  const openRate = sent > 0 ? Math.round(((s.opened ?? 0) / sent) * 100) : 0;

  const stat = (label: string, value: number | undefined, cls = 'text-slate-900') => (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${cls}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {fmtInt(value ?? 0)}
      </div>
    </div>
  );

  return (
    <div>
      <Link href="/campaigns" className="text-sm text-slate-400 hover:text-slate-600">
        ← Campanhas
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Assunto: <span className="text-slate-700">{campaign.subject}</span>
          </p>
        </div>
        <CampaignControls
          campaign={campaign}
          pending={pending}
          sentCount={sent}
          accounts={accounts ?? []}
        />
      </div>

      {campaign.status === 'running' && campaign.gmail_account_id && activeAccounts > 1 && (
        <div className="mb-6">
          <Banner tone="info" title="Você pode dobrar a velocidade desta campanha">
            Ela está fixada em <b>{sendAccount}</b>. Como o intervalo é aplicado por conta, mudar
            para “Distribuir entre todas as contas ativas” multiplicaria a capacidade por{' '}
            {activeAccounts} — hoje o teto é {fmtInt(perDayCeiling)} envios/dia.
          </Banner>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-sm font-medium text-slate-500">Enviados hoje</div>
          <div className="mt-1 text-4xl font-semibold leading-none text-slate-900">
            {fmtInt(campaign.sent_today)}
          </div>
          <div className="mt-1.5 text-sm text-slate-500">
            de {fmtInt(campaign.daily_limit)} do limite diário ·{' '}
            <b className="text-slate-700">
              {fmtInt(Math.max(campaign.daily_limit - campaign.sent_today, 0))} restantes
            </b>
          </div>
          <Meter value={campaign.sent_today} max={campaign.daily_limit} className="mt-3" />
          <div className="mt-2 text-[11px] text-slate-400">
            {fmtInt(sentLast24h ?? 0)} enviados nas últimas 24h
          </div>
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium text-slate-500">Faltam enviar</div>
          <div className="mt-1 text-4xl font-semibold leading-none text-slate-900">
            {fmtInt(pending)}
          </div>
          <div className="mt-1.5 text-sm text-slate-500">
            de {fmtInt(total)} contatos · {fmtInt(done)} concluídos
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {daysLeft ? `~${daysLeft} dia(s) no ritmo atual` : 'sem ritmo definido'}
            {(s.retry_queued ?? 0) > 0 && ` · ${fmtInt(s.retry_queued)} aguardando nova tentativa`}
          </div>
        </div>

        <div className="card p-5">
          <div className="text-sm font-medium text-slate-500">Configuração de envio</div>
          <dl className="mt-2 space-y-1 text-sm text-slate-600">
            <div className="flex justify-between gap-2">
              <dt>Remetente</dt>
              <dd className="truncate text-slate-800">{campaign.from_name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Conta</dt>
              <dd className="truncate text-slate-800">{sendAccount}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Intervalo</dt>
              <dd className="text-slate-800">{campaign.send_interval_seconds}s por conta</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Teto por dia</dt>
              <dd className="text-slate-800">{fmtInt(effectiveDaily)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Rastrear abertura</dt>
              <dd className="text-slate-800">{campaign.track_opens ? 'Sim' : 'Não'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Último envio</dt>
              <dd className="text-slate-800">{fmtDate(campaign.last_send_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 md:grid-cols-6">
        {stat('Total', total)}
        {stat('Na fila', pending, 'text-slate-700')}
        {stat('Enviados', sent, 'text-blue-600')}
        {stat('Aberturas', s.opened, 'text-green-600')}
        {stat('Respostas', s.replied, 'text-green-700')}
        {stat('Inválidos', s.bounced, 'text-red-600')}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 font-semibold text-slate-900">Engajamento</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Taxa de abertura real</dt>
              <dd className="font-semibold text-slate-900">{openRate}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Descadastrados</dt>
              <dd className="font-semibold text-slate-900">{fmtInt(s.unsubscribed)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Falhas definitivas</dt>
              <dd className="font-semibold text-slate-900">{fmtInt(s.failed)}</dd>
            </div>
          </dl>
          {(s.prefetch ?? 0) > 0 && (
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
              {fmtInt(s.prefetch)} aberturas automáticas (proxy do Gmail/Outlook) foram
              desconsideradas na taxa acima.
            </p>
          )}
          <div className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
            {campaign.body_html}
          </div>
        </div>
        <ImportPanel campaignId={campaign.id} />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
          Contatos ({fmtInt(total)}){total > 500 ? ' — mostrando os 500 primeiros' : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Nome</th>
                <th className="px-5 py-2 text-left font-medium">Email</th>
                <th className="px-5 py-2 text-left font-medium">Status</th>
                <th className="px-5 py-2 text-center font-medium">Aberturas</th>
                <th className="px-5 py-2 text-left font-medium">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-50">
                  <td className="px-5 py-2 text-slate-700">{c.name || '—'}</td>
                  <td className="px-5 py-2 text-slate-600">{c.email}</td>
                  <td className="px-5 py-2">
                    <StatusBadge status={c.status} />
                    {c.status === 'pending' && c.next_attempt_at && (
                      <span className="ml-1 text-[10px] text-amber-600">retentativa</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-center">
                    {c.open_count > 0 ? (
                      <span className="badge bg-green-100 text-green-700">👁 {c.open_count}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-400">{fmtDate(c.sent_at)}</td>
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
