import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { PageHeader, StatusBadge, Meter, fmtInt } from '@/components/ui';
import NewCampaign from '@/components/NewCampaign';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const supabase = createClient();

  const [{ data: campaigns }, { data: stats }, { data: accounts }] = await Promise.all([
    supabase.from('mail_campaigns').select('*').order('created_at', { ascending: false }),
    supabase.from('mail_campaign_stats').select('*'),
    supabase.from('mail_gmail_accounts').select('id,email,status').order('created_at'),
  ]);

  const statMap = new Map((stats ?? []).map((s: any) => [s.campaign_id, s]));

  return (
    <div>
      <PageHeader
        title="Campanhas"
        subtitle="Cada campanha tem sua própria lista. Um email nunca se repete entre campanhas."
        action={<NewCampaign accounts={accounts ?? []} />}
      />

      {(campaigns ?? []).length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          Nenhuma campanha ainda. Crie a primeira para começar.
        </div>
      ) : (
        <div className="space-y-3">
          {(campaigns ?? []).map((c) => {
            const s: any = statMap.get(c.id) ?? {};
            const total = s.total ?? 0;
            const pending = s.pending ?? 0;
            const done = total - pending;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="card block p-5 transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-900">{c.name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-400">{c.subject}</p>
                  </div>
                  <div
                    className="shrink-0 text-right"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    <div className="text-sm text-slate-500">
                      faltam <b className="text-slate-800">{fmtInt(pending)}</b> de {fmtInt(total)}
                    </div>
                    <div className="text-xs text-slate-400">
                      {fmtInt(s.opened)} aberturas · {fmtInt(s.replied)} respostas ·{' '}
                      {fmtInt(s.bounced)} inválidos
                    </div>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="w-32 shrink-0 text-[11px] text-slate-400">
                    hoje {fmtInt(c.sent_today)}/{fmtInt(c.daily_limit)}
                  </div>
                  <Meter value={c.sent_today} max={c.daily_limit} className="max-w-[160px]" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
