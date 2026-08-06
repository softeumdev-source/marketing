import { createClient } from '@/lib/supabase-server';
import { PageHeader } from '@/components/ui';
import AccountsManager from '@/components/AccountsManager';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const supabase = createClient();
  const { data: accounts } = await supabase
    .from('mail_gmail_accounts')
    .select('id,email,display_name,status,sent_today,daily_limit,last_error')
    .order('created_at', { ascending: true });

  return (
    <div>
      <PageHeader
        title="Contas Gmail"
        subtitle="Conecte várias contas. O sistema distribui os envios entre elas e respeita o limite diário de cada uma."
      />
      <AccountsManager accounts={accounts ?? []} />
    </div>
  );
}
