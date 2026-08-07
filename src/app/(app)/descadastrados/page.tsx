import { createClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function UnsubscribedBox() {
  const supabase = createClient();
  const { data: contacts } = await supabase
    .from('mail_contacts')
    .select('id,name,email,unsubscribed_at,mail_campaigns(name)')
    .eq('status', 'unsubscribed')
    .order('unsubscribed_at', { ascending: false })
    .limit(2000);

  return (
    <div>
      <PageHeader
        title="Inscrições canceladas"
        subtitle="Contatos que cancelaram a inscrição. Saíram da campanha e não recebem mais emails, nem podem ser recadastrados."
      />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-5 py-2">Nome</th>
                <th className="text-left font-medium px-5 py-2">Email</th>
                <th className="text-left font-medium px-5 py-2">Campanha</th>
                <th className="text-left font-medium px-5 py-2">Cancelou em</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-slate-50">
                  <td className="px-5 py-2 text-slate-700">{c.name || '—'}</td>
                  <td className="px-5 py-2 text-slate-600">{c.email}</td>
                  <td className="px-5 py-2 text-slate-500">{c.mail_campaigns?.name || '—'}</td>
                  <td className="px-5 py-2 text-slate-400 text-xs">{fmtDate(c.unsubscribed_at)}</td>
                </tr>
              ))}
              {(contacts ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                    Nenhuma inscrição cancelada.
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
