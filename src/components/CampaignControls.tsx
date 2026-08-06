'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CampaignControls({
  campaignId,
  status,
  pending,
}: {
  campaignId: string;
  status: string;
  pending: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function act(action: string) {
    setLoading(true);
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setLoading(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm('Excluir esta campanha e todos os seus contatos? Isso libera os emails para uso em outras campanhas.')) return;
    setLoading(true);
    await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
    setLoading(false);
    router.push('/campaigns');
  }

  return (
    <div className="flex items-center gap-2">
      {(status === 'draft' || status === 'paused') && (
        <button className="btn-primary" disabled={loading || pending === 0} onClick={() => act('start')}>
          {status === 'draft' ? '▶ Iniciar envio' : '▶ Retomar'}
        </button>
      )}
      {status === 'running' && (
        <button className="btn-ghost" disabled={loading} onClick={() => act('pause')}>
          ⏸ Pausar
        </button>
      )}
      <button className="btn-danger" disabled={loading} onClick={remove}>
        Excluir
      </button>
    </div>
  );
}
