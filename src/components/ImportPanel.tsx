'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const EMAIL_RE = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/;

type Parsed = { nome: string; email: string };

function parseList(text: string): Parsed[] {
  const out: Parsed[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const emailMatch = line.match(EMAIL_RE);
    if (!emailMatch) continue;
    const email = emailMatch[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    // Everything that isn't the email, cleaned of separators, becomes the name.
    const nome = line
      .replace(emailMatch[0], '')
      .replace(/[,;\t]+/g, ' ')
      .replace(/["<>]/g, '')
      .trim();
    out.push({ nome, email });
  }
  return out;
}

export default function ImportPanel({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; invalid: number } | null>(null);
  const [error, setError] = useState('');

  const preview = parseList(text);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText((prev) => (prev ? prev + '\n' : '') + String(reader.result || ''));
    reader.readAsText(file);
  }

  async function submit() {
    if (!preview.length) return;
    setLoading(true);
    setError('');
    setResult(null);
    const res = await fetch(`/api/campaigns/${campaignId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: preview }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || 'Erro ao importar');
      return;
    }
    setResult(json);
    setText('');
    router.refresh();
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-900 mb-1">Importar lista</h2>
      <p className="text-sm text-slate-500 mb-3">
        Cole uma linha por contato (<code>Nome, email@dominio.com</code>) ou envie um arquivo CSV/TXT.
        Emails duplicados — nesta ou em qualquer outra campanha — são ignorados automaticamente.
      </p>
      <textarea
        className="input min-h-[120px] font-mono text-xs"
        placeholder={'João Silva, joao@empresa.com\nMaria, maria@empresa.com'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="btn-ghost cursor-pointer">
          Escolher arquivo
          <input type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
        </label>
        <div className="text-sm text-slate-500">
          {preview.length} contato(s) válido(s) detectado(s)
        </div>
        <button className="btn-primary" onClick={submit} disabled={loading || !preview.length}>
          {loading ? 'Importando…' : 'Importar'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {result && (
        <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          {result.inserted} adicionados · {result.duplicates} duplicados ignorados · {result.invalid} inválidos
        </div>
      )}
    </div>
  );
}
