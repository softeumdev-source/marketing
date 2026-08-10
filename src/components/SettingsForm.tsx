'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MailSettings } from '@/lib/dashboard';

export default function SettingsForm({ settings }: { settings: MailSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    timezone: settings.timezone,
    send_window_start: settings.send_window_start.slice(0, 5),
    send_window_end: settings.send_window_end.slice(0, 5),
    send_weekdays_only: settings.send_weekdays_only,
    jitter_seconds: settings.jitter_seconds,
    open_min_delay_seconds: settings.open_min_delay_seconds,
    max_attempts: settings.max_attempts,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setMsg('');
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Não foi possível salvar.');
      return;
    }
    setMsg('Configurações salvas.');
    router.refresh();
  }

  const alwaysOn = form.send_window_start === form.send_window_end;

  return (
    <form onSubmit={save} className="card max-w-2xl space-y-5 p-6">
      <div>
        <h2 className="font-semibold text-slate-900">Janela de envio</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Enviar em horário comercial melhora a entrega e reduz a chance de cair em spam. Deixe os
          dois horários iguais para enviar 24h por dia.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label">Começa às</label>
            <input
              type="time"
              className="input"
              value={form.send_window_start}
              onChange={(e) => set('send_window_start', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Termina às</label>
            <input
              type="time"
              className="input"
              value={form.send_window_end}
              onChange={(e) => set('send_window_end', e.target.value)}
            />
          </div>
        </div>
        {alwaysOn && (
          <p className="mt-2 text-xs text-amber-600">
            Horários iguais: o sistema enviará a qualquer hora do dia.
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.send_weekdays_only}
            onChange={(e) => set('send_weekdays_only', e.target.checked)}
          />
          Enviar somente de segunda a sexta
        </label>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="font-semibold text-slate-900">Comportamento do envio</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Variação aleatória (seg)</label>
            <input
              type="number"
              min={0}
              max={600}
              className="input"
              value={form.jitter_seconds}
              onChange={(e) => set('jitter_seconds', Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Somado ao intervalo da campanha, de forma aleatória, para o envio não ficar robótico.
            </p>
          </div>
          <div>
            <label className="label">Tentativas por contato</label>
            <input
              type="number"
              min={1}
              max={10}
              className="input"
              value={form.max_attempts}
              onChange={(e) => set('max_attempts', Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Falhas temporárias são repetidas com intervalo crescente. Recusas definitivas vão
              direto para a caixa de inválidos.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="font-semibold text-slate-900">Rastreamento de abertura</h2>
        <div className="mt-3 max-w-xs">
          <label className="label">Ignorar aberturas nos primeiros (seg)</label>
          <input
            type="number"
            min={0}
            max={3600}
            className="input"
            value={form.open_min_delay_seconds}
            onChange={(e) => set('open_min_delay_seconds', Number(e.target.value))}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Gmail e Outlook baixam a imagem de rastreamento assim que o email chega. Aberturas
            registradas antes desse tempo são contadas como automáticas, não como leitura real.
            Recomendado: 60s.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="font-semibold text-slate-900">Fuso horário</h2>
        <div className="mt-3 max-w-xs">
          <label className="label">Fuso usado para limites e janela</label>
          <input
            className="input"
            value={form.timezone}
            onChange={(e) => set('timezone', e.target.value)}
            placeholder="America/Sao_Paulo"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button className="btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  );
}
