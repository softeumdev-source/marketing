'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCampaign() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    subject: '',
    from_name: '',
    body_html: 'Olá {{primeiro_nome}},\n\n',
    daily_limit: 200,
    send_interval_seconds: 90,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || 'Erro ao criar campanha');
      return;
    }
    setOpen(false);
    router.push(`/campaigns/${json.id}`);
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Nova campanha
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900 mb-4">Nova campanha</h2>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label">Nome da campanha</label>
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex.: Promoção de Agosto" />
              </div>
              <div>
                <label className="label">Assunto do email</label>
                <input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} required placeholder="Olá {{primeiro_nome}}, temos novidades" />
              </div>
              <div>
                <label className="label">Nome do remetente</label>
                <input className="input" value={form.from_name} onChange={(e) => set('from_name', e.target.value)} placeholder="Softeum" />
              </div>
              <div>
                <label className="label">Mensagem (use {'{{nome}}'}, {'{{primeiro_nome}}'})</label>
                <textarea className="input min-h-[140px]" value={form.body_html} onChange={(e) => set('body_html', e.target.value)} required />
                <p className="text-xs text-slate-400 mt-1">Pode escrever texto normal ou HTML. Variáveis: {'{{nome}}'}, {'{{primeiro_nome}}'}, {'{{email}}'}.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Limite por dia</label>
                  <input type="number" min={1} className="input" value={form.daily_limit} onChange={(e) => set('daily_limit', Number(e.target.value))} />
                </div>
                <div>
                  <label className="label">Intervalo entre envios (seg)</label>
                  <input type="number" min={1} className="input" value={form.send_interval_seconds} onChange={(e) => set('send_interval_seconds', Number(e.target.value))} />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
                <button className="btn-primary" disabled={loading}>{loading ? 'Criando…' : 'Criar campanha'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
