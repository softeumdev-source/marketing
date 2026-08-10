'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  from_name: string;
  body_html: string;
  daily_limit: number;
  send_interval_seconds: number;
  track_opens: boolean;
  gmail_account_id: string | null;
  status: string;
};

type AccountOpt = { id: string; email: string; status: string };

export default function CampaignControls({
  campaign,
  pending,
  sentCount,
  accounts = [],
}: {
  campaign: Campaign;
  pending: number;
  sentCount: number;
  accounts?: AccountOpt[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const status = campaign.status;

  async function act(action: string) {
    setLoading(true);
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setLoading(false);
    router.refresh();
  }

  async function restart() {
    if (!confirm(`Rodar a campanha novamente? Os ${sentCount} contatos já enviados voltam para a fila e serão reenviados. (Inválidos, respondidos e descadastrados são mantidos de fora.)`)) return;
    setLoading(true);
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restart' }),
    });
    setLoading(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm('Excluir esta campanha e todos os seus contatos? Isso libera os emails para uso em outras campanhas.')) return;
    setLoading(true);
    await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
    setLoading(false);
    router.push('/campaigns');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      {/* A campanha fica 'completed' quando a fila zera. Se depois disso entrarem
          contatos novos (uma importação, por exemplo), basta retomar: 'Rodar
          novamente' requeueria também quem já recebeu, causando reenvio. */}
      {status === 'completed' && pending > 0 && (
        <button className="btn-primary" disabled={loading} onClick={() => act('start')}>
          ▶ Enviar os {pending.toLocaleString('pt-BR')} pendentes
        </button>
      )}
      {status === 'completed' && (
        <button
          className={pending > 0 ? 'btn-ghost' : 'btn-primary'}
          disabled={loading}
          onClick={restart}
        >
          🔁 Rodar novamente
        </button>
      )}
      <button className="btn-ghost" disabled={loading} onClick={() => setEditing(true)}>
        ✏️ Editar
      </button>
      <button className="btn-danger" disabled={loading} onClick={remove}>
        Excluir
      </button>

      {editing && <EditModal campaign={campaign} accounts={accounts} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditModal({ campaign, accounts, onClose }: { campaign: Campaign; accounts: AccountOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: campaign.name,
    subject: campaign.subject,
    from_name: campaign.from_name || '',
    body_html: campaign.body_html,
    daily_limit: campaign.daily_limit,
    send_interval_seconds: campaign.send_interval_seconds,
    track_opens: campaign.track_opens,
    gmail_account_id: campaign.gmail_account_id || '',
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Erro ao salvar');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4 text-left" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Editar campanha</h2>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Nome da campanha</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">Assunto do email</label>
            <input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} required />
          </div>
          <div>
            <label className="label">Nome do remetente</label>
            <input className="input" value={form.from_name} onChange={(e) => set('from_name', e.target.value)} />
          </div>
          <div>
            <label className="label">Enviar por qual conta Gmail?</label>
            <select className="input" value={form.gmail_account_id} onChange={(e) => set('gmail_account_id', e.target.value)}>
              <option value="">Distribuir entre todas as contas ativas</option>
              {accounts.filter((a) => a.status === 'active').map((a) => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Mensagem (use {'{{nome}}'}, {'{{primeiro_nome}}'})</label>
            <textarea className="input min-h-[160px]" value={form.body_html} onChange={(e) => set('body_html', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Limite por dia</label>
              <input type="number" min={1} className="input" value={form.daily_limit} onChange={(e) => set('daily_limit', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Intervalo (seg)</label>
              <input type="number" min={1} className="input" value={form.send_interval_seconds} onChange={(e) => set('send_interval_seconds', Number(e.target.value))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.track_opens} onChange={(e) => set('track_opens', e.target.checked)} />
            Rastrear aberturas (pixel)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
