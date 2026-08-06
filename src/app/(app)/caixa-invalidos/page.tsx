import { createClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InvalidBox() {
  const supabase = createClient();
  const { data: contacts } = await supabase
    .from('mail_contacts')
    .select('id,name,email,bounce_reason,bounced_at,mail_campaigns(name)')
    .in('status', ['bounced', 'invalid'])
    .order('bounced_at', { ascending: false })
    .limit(1000);

  return (
    <div>
      <PageHeader
        title="Emails inválidos"
        subtitle="Emails que retornaram como inexistentes. Foram removidos automaticamente das campanhas."
      />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-5 py-2">Nome</th>
                <th className="text-left font-medium px-5 py-2">Email</th>
                <th className="text-left font-medium px-5 py-2">Campanha</th>
                <th className="text-left font-medium px-5 py-2">Motivo</th>
                <th className="text-left font-medium px-5 py-2">Quando</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-slate-50">
                  <td className="px-5 py-2 text-slate-700">{c.name || '—'}</td>
                  <td className="px-5 py-2 text-slate-600">{c.email}</td>
                  <td className="px-5 py-2 text-slate-500">{c.mail_campaigns?.name || '—'}</td>
                  <td className="px-5 py-2 text-red-600 text-xs max-w-xs truncate">{c.bounce_reason || '—'}</td>
                  <td className="px-5 py-2 text-slate-400 text-xs">{fmtDate(c.bounced_at)}</td>
                </tr>
              ))}
              {(contacts ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Nenhum email inválido.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
