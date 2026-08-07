import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { PageHeader, StatusBadge } from '@/components/ui';
import NewCampaign from '@/components/NewCampaign';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: campaigns } = await supabase
    .from('mail_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: stats } = await supabase.from('mail_campaign_stats').select('*');
  const statMap = new Map((stats ?? []).map((s: any) => [s.campaign_id, s]));

  const { data: accounts } = await supabase
    .from('mail_gmail_accounts')
    .select('id,email,status')
    .order('created_at', { ascending: true });

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
            const sent = s.sent ?? 0;
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="card p-5 block hover:shadow-md transition">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-slate-400 truncate mt-0.5">{c.subject}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-slate-500">
                      {sent}/{total} enviados
                    </div>
                    <div className="text-xs text-slate-400">
                      {s.opened ?? 0} aberturas · {s.replied ?? 0} respostas · {s.bounced ?? 0} inválidos
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
