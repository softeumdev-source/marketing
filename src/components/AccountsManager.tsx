'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Account = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  sent_today: number;
  daily_limit: number;
  last_error: string | null;
  signature_html: string;
};

function SignatureEditor({ account }: { account: Account }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(account.signature_html || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature_html: value }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        className="text-xs font-medium text-brand-600 hover:text-brand-700"
        onClick={() => setOpen((o) => !o)}
      >
        ✍️ Assinatura {account.signature_html ? '(configurada)' : '(nenhuma)'} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2">
          <textarea
            className="input min-h-[90px] text-xs"
            placeholder={'Atenciosamente,\nDiiego Martins\nSofteum · (47) 98801-8335'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Texto ou HTML. É anexada automaticamente no rodapé de todo email desta conta.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-primary text-xs py-1" onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar assinatura'}
            </button>
            {saved && <span className="text-xs text-green-600">Salvo!</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsManager({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    display_name: '',
    daily_limit: 400,
    signature_html: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setOk('');
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || 'Falha ao conectar. Verifique o email e a senha de app.');
      return;
    }
    setOk('Conta conectada com sucesso!');
    setForm({ email: '', password: '', display_name: '', daily_limit: 400, signature_html: '' });
    router.refresh();
  }

  async function toggle(id: string, status: string) {
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'active' ? 'paused' : 'active' }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Remover esta conta Gmail?')) return;
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form onSubmit={add} className="card p-5 space-y-3 h-fit">
        <h2 className="font-semibold text-slate-900">Conectar conta Gmail</h2>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          Use uma <b>Senha de app</b> do Google (não a senha normal). Ative a verificação em 2 etapas e gere em
          myaccount.google.com → Segurança → Senhas de app.
        </div>
        <div>
          <label className="label">Email do Gmail</label>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required placeholder="voce@gmail.com" />
        </div>
        <div>
          <label className="label">Senha de app (16 caracteres)</label>
          <input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} required placeholder="xxxx xxxx xxxx xxxx" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome exibido</label>
            <input className="input" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="Softeum" />
          </div>
          <div>
            <label className="label">Limite diário</label>
            <input className="input" type="number" min={1} value={form.daily_limit} onChange={(e) => set('daily_limit', Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">Assinatura (opcional)</label>
          <textarea className="input min-h-[80px] text-xs" value={form.signature_html} onChange={(e) => set('signature_html', e.target.value)} placeholder={'Atenciosamente,\nDiiego Martins\nSofteum · (47) 98801-8335'} />
          <p className="text-[11px] text-slate-400 mt-1">Anexada automaticamente no rodapé de todo email. Texto ou HTML.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-600">{ok}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Testando conexão…' : 'Testar e conectar'}
        </button>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold text-slate-900">Contas conectadas ({accounts.length})</h2>
        {accounts.length === 0 && (
          <div className="card p-6 text-center text-slate-400 text-sm">Nenhuma conta conectada.</div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{a.email}</div>
                <div className="text-xs text-slate-400">
                  {a.display_name || 'sem nome'} · {a.sent_today}/{a.daily_limit} hoje
                </div>
              </div>
              <span className={`badge ${a.status === 'active' ? 'bg-green-100 text-green-700' : a.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {a.status === 'active' ? 'Ativa' : a.status === 'error' ? 'Erro' : 'Pausada'}
              </span>
            </div>
            {a.last_error && <div className="mt-2 text-xs text-red-500 truncate">{a.last_error}</div>}
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost text-xs py-1" onClick={() => toggle(a.id, a.status)}>
                {a.status === 'active' ? 'Pausar' : 'Ativar'}
              </button>
              <button className="btn-danger text-xs py-1" onClick={() => remove(a.id)}>Remover</button>
            </div>
            <SignatureEditor account={a} />
          </div>
        ))}
      </div>
    </div>
  );
}
