'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

// Branded HTML signature (email-safe inline styles), matching the Softeum layout.
export function brandedSignature(logoUrl: string): string {
  return `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#1f2937"><tr><td style="vertical-align:middle;padding-right:16px"><img src="${logoUrl}" width="64" height="64" alt="Softeum" style="display:block;border:0;width:64px;height:64px"/></td><td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:#111827">Diiego Martins</div><div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#8b7fd9;text-transform:uppercase">Executivo de Contas</div><div style="font-size:14px;font-weight:bold;color:#111827">Softeum</div></td></tr></table><div style="border-top:1px solid #e5e7eb;margin:10px 0;max-width:340px"></div><table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151"><tr><td style="padding:2px 0">(47) 9 9659-2551 &nbsp;<span style="background:#e79bb5;color:#ffffff;border-radius:10px;padding:2px 9px;font-size:11px">WhatsApp</span></td></tr><tr><td style="padding:2px 0"><a href="mailto:comercial@softeum.com.br" style="color:#2563eb;text-decoration:none">comercial@softeum.com.br</a> &nbsp;<span style="background:#b8a9e0;color:#ffffff;border-radius:10px;padding:2px 9px;font-size:11px">E-mail</span></td></tr><tr><td style="padding:6px 0"><a href="https://www.softeum.com.br" style="color:#6bb8c9;text-decoration:none;font-weight:bold">www.softeum.com.br</a></td></tr></table><div style="border-left:4px solid #a78bfa;background:#faf0f4;padding:10px 14px;font-style:italic;color:#6b7280;font-size:13px;max-width:320px">Pedidos por e-mail viram pedidos no seu ERP. <b>Sem digitar.</b></div>`;
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

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

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg('');
    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `logos/${account.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('assets').getPublicUrl(path);
      setValue(brandedSignature(data.publicUrl));
      setUploadMsg('Logo enviada! Confira abaixo e clique em Salvar.');
    } catch (err: unknown) {
      setUploadMsg('Falha ao enviar a logo: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
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
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="btn-ghost text-xs py-1 cursor-pointer">
              {uploading ? 'Enviando…' : '📷 Enviar logo e gerar assinatura'}
              <input type="file" accept="image/*" className="hidden" onChange={onLogo} disabled={uploading} />
            </label>
            {uploadMsg && <span className="text-[11px] text-slate-500">{uploadMsg}</span>}
          </div>
          <textarea
            className="input min-h-[110px] text-xs font-mono"
            placeholder={'Atenciosamente,\nDiiego Martins\nSofteum · (47) 98801-8335'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Texto ou HTML. É anexada automaticamente no rodapé de todo email desta conta. Use o botão acima para
            enviar a logo e gerar a assinatura pronta.
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
