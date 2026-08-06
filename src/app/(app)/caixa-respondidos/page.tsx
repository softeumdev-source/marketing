import { createClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RepliedBox() {
  const supabase = createClient();
  const { data: contacts } = await supabase
    .from('mail_contacts')
    .select('id,name,email,reply_snippet,replied_at,mail_campaigns(name)')
    .eq('status', 'replied')
    .order('replied_at', { ascending: false })
    .limit(1000);

  return (
    <div>
      <PageHeader
        title="Responderam"
        subtitle="Contatos que responderam ao email. Foram removidos automaticamente das campanhas."
      />
      {(contacts ?? []).length === 0 ? (
        <div className="card p-10 text-center text-slate-400">Ninguém respondeu ainda.</div>
      ) : (
        <div className="space-y-3">
          {(contacts ?? []).map((c: any) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{c.name || c.email}</div>
                  <div className="text-xs text-slate-400">{c.email} · {c.mail_campaigns?.name || '—'}</div>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{fmtDate(c.replied_at)}</span>
              </div>
              {c.reply_snippet && (
                <p className="mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                  “{c.reply_snippet}”
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
