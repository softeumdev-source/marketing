import { getSettings } from '@/lib/dashboard';
import { PageHeader, Banner } from '@/components/ui';
import SettingsForm from '@/components/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <PageHeader
        title="Configurações de envio"
        subtitle="Valem para todas as campanhas e contas."
      />

      {settings?.secret_is_default && (
        <div className="mb-6">
          <Banner tone="danger" title="Os segredos padrão ainda estão ativos">
            <code>CRON_SECRET</code> e <code>ENCRYPTION_KEY</code> estão no código-fonte de um
            repositório público. Enquanto isso, quem tiver acesso ao repositório consegue chamar o
            worker e descriptografar as senhas de app do Gmail. O README traz o passo a passo em{' '}
            <b>Rotação de segredos</b>.
          </Banner>
        </div>
      )}

      {settings ? (
        <SettingsForm settings={settings} />
      ) : (
        <Banner tone="danger" title="Não foi possível carregar as configurações" />
      )}
    </div>
  );
}
