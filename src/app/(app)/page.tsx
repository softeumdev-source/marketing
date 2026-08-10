import Link from 'next/link';
import { getDashboard, getSettings } from '@/lib/dashboard';
import { HeroStat, StatCard, Meter, Banner, PageHeader, StatusBadge, fmtInt } from '@/components/ui';
import DailyChart from '@/components/DailyChart';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function fmtClock(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(11, 16);
}

export default async function Dashboard() {
  const [data, settings] = await Promise.all([getDashboard(14), getSettings()]);

  if (!data) {
    return (
      <div>
        <PageHeader title="Painel" />
        <Banner tone="danger" title="Não foi possível carregar as estatísticas">
          Verifique a conexão com o Supabase e recarregue a página.
        </Banner>
      </div>
    );
  }

  const { today_stats: t, queue: q, capacity: cap, eta } = data;
  const activeAccounts = data.accounts.filter((a) => a.status === 'active');
  const accountCapacity = activeAccounts.reduce((s, a) => s + a.daily_limit, 0);
  const staleScan = data.accounts.filter(
    (a) =>
      a.status === 'active' &&
      (!a.last_scan_at || Date.now() - new Date(a.last_scan_at).getTime() > 6 * 3600 * 1000)
  );

  const openRate = pct(t.opens, t.sent);
  const totalOpenRate = pct(q.opened, q.sent);

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle={`Hoje é ${data.today.split('-').reverse().join('/')} · ${fmtClock(
          data.now_local
        )} (${data.tz})`}
      />

      <div className="space-y-3 mb-6">
        {settings?.secret_is_default && (
          <Banner tone="danger" title="Segurança: o sistema está usando os segredos padrão">
            O repositório é público e os segredos (<code>CRON_SECRET</code> e{' '}
            <code>ENCRYPTION_KEY</code>) estão no código. Com eles é possível ler as senhas de app
            das contas Gmail. Faça a rotação seguindo o passo a passo do README (seção{' '}
            <b>Rotação de segredos</b>) e, se possível, deixe o repositório privado.
          </Banner>
        )}

        {!data.in_window && (
          <Banner tone="warning" title="Fora da janela de envio">
            Os envios estão pausados até {data.window.start.slice(0, 5)}
            {data.window.weekdays_only ? ' (somente dias úteis)' : ''}. A janela configurada é{' '}
            {data.window.start.slice(0, 5)}–{data.window.end.slice(0, 5)}.{' '}
            <Link href="/configuracoes" className="underline">
              Ajustar
            </Link>
          </Banner>
        )}

        {data.in_window && cap.remaining_today === 0 && q.pending > 0 && (
          <Banner tone="info" title="Limite diário atingido">
            As {fmtInt(cap.sent_today)} mensagens de hoje já saíram. Os envios voltam
            automaticamente amanhã. Para acelerar, aumente o limite diário da campanha ou distribua
            entre mais contas Gmail.
          </Banner>
        )}

        {staleScan.length > 0 && (
          <Banner tone="warning" title="Verificação de respostas atrasada">
            {staleScan.map((a) => a.email).join(', ')} não {staleScan.length > 1 ? 'foram' : 'foi'}{' '}
            verificad{staleScan.length > 1 ? 'as' : 'a'} nas últimas 6 horas — respostas e emails
            inválidos podem estar passando batido.
          </Banner>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <HeroStat
          label="Enviados hoje"
          value={fmtInt(t.sent)}
          hint={
            <>
              de {fmtInt(cap.limit_today)} liberados para hoje ·{' '}
              <b className="text-slate-700">{fmtInt(cap.remaining_today)} restantes</b>
            </>
          }
        >
          <Meter value={cap.sent_today} max={cap.limit_today} className="mt-4" />
        </HeroStat>

        <HeroStatQueue pending={q.pending} eta={eta} total={q.total} sent={q.sent} />

        <div className="card p-6">
          <div className="text-sm font-medium text-slate-500">Resultado de hoje</div>
          <dl className="mt-3 space-y-2 text-sm">
            <LineItem label="Aberturas reais" value={t.opens} extra={`${openRate}%`} />
            <LineItem label="Respostas" value={t.replies} />
            <LineItem label="Inválidos (bounce)" value={t.bounces} />
            <LineItem label="Descadastros" value={t.unsubs} />
            <LineItem label="Falhas de envio" value={t.failed} />
          </dl>
          {t.prefetch > 0 && (
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
              {fmtInt(t.prefetch)} aberturas automáticas do Gmail/Outlook foram descartadas — só
              contamos quem abriu de verdade.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Contatos na base" value={fmtInt(q.total)} hint={`${fmtInt(q.sent)} já receberam`} />
        <StatCard
          label="Aberturas (total)"
          value={fmtInt(q.opened)}
          hint={`${totalOpenRate}% de quem recebeu`}
          accent="text-green-600"
        />
        <StatCard label="Responderam" value={fmtInt(q.replied)} accent="text-green-700" />
        <StatCard
          label="Bloqueados"
          value={fmtInt(data.suppressed)}
          hint="nunca serão reimportados"
          accent="text-red-600"
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DailyChart series={data.series} tz={data.tz} />
        </div>

        <div className="card p-5">
          <h2 className="mb-1 font-semibold text-slate-900">Contas Gmail</h2>
          <p className="mb-4 text-xs text-slate-400">
            Capacidade total hoje: {fmtInt(accountCapacity)} envios
          </p>
          <div className="space-y-4">
            {data.accounts.length === 0 && (
              <p className="text-sm text-slate-400">Nenhuma conta conectada.</p>
            )}
            {data.accounts.map((a) => (
              <div key={a.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-700">{a.email}</span>
                  <span
                    className="shrink-0 text-xs text-slate-500"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtInt(a.sent_today)}/{fmtInt(a.daily_limit)}
                  </span>
                </div>
                <Meter value={a.sent_today} max={a.daily_limit} className="mt-1.5" />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                  <span>
                    {a.status === 'active' ? 'Ativa' : a.status === 'error' ? 'Erro' : 'Pausada'}
                    {a.sent_today >= a.daily_limit && ' · limite atingido'}
                  </span>
                  <span>último envio {fmtDate(a.last_send_at)}</span>
                </div>
                {(a.scan_error || a.last_error) && (
                  <div className="mt-1 truncate text-[11px] text-red-500">
                    {a.scan_error || a.last_error}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Link href="/accounts" className="mt-4 block text-xs font-medium text-brand-600 hover:text-brand-700">
            Gerenciar contas →
          </Link>
        </div>
      </div>

      <div className="card mt-8 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Campanhas</h2>
          <Link href="/campaigns" className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Ver todas →
          </Link>
        </div>
        {data.campaigns.length === 0 && (
          <p className="text-sm text-slate-400">Nenhuma campanha ainda.</p>
        )}
        <div className="space-y-3">
          {data.campaigns.map((c) => {
            const done = c.total - c.pending;
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-slate-800">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div
                    className="shrink-0 text-right text-xs text-slate-500"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtInt(done)}/{fmtInt(c.total)} · faltam {fmtInt(c.pending)}
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${pct(done, c.total)}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400">
                  {fmtInt(c.sent_today)}/{fmtInt(c.daily_limit)} hoje · 1 envio a cada{' '}
                  {c.interval_seconds}s
                  {c.gmail_account_id ? ' · conta fixa' : ' · todas as contas'}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HeroStatQueue({
  pending,
  total,
  sent,
  eta,
}: {
  pending: number;
  total: number;
  sent: number;
  eta: { avg_per_day: number; days_left: number | null; finish_date: string | null };
}) {
  return (
    <div className="card p-6">
      <div className="text-sm font-medium text-slate-500">Faltam enviar</div>
      <div className="mt-1 text-5xl font-semibold leading-none text-slate-900">
        {fmtInt(pending)}
      </div>
      <div className="mt-2 text-sm text-slate-500">
        de {fmtInt(total)} contatos · {fmtInt(sent)} já enviados
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${pct(total - pending, total)}%` }}
        />
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
        {eta.days_left
          ? `Ritmo de ${eta.avg_per_day}/dia · ~${eta.days_left} dia(s) para terminar${
              eta.finish_date ? ` (${eta.finish_date.split('-').reverse().join('/')})` : ''
            }`
          : 'Sem envios recentes para estimar o prazo.'}
      </div>
    </div>
  );
}

function LineItem({
  label,
  value,
  extra,
}: {
  label: string;
  value: number;
  extra?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtInt(value)}
        </span>
        {extra && <span className="text-xs text-slate-400">{extra}</span>}
      </dd>
    </div>
  );
}
