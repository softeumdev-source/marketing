'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const EMAIL_RE = /[^\s,;<>"()[\]]+@[^\s,;<>"()[\]]+\.[A-Za-z]{2,}/;
const CHUNK = 5000;

type Parsed = { nome: string; email: string };

type ImportResult = {
  total: number;
  inserted: number;
  invalid: number;
  duplicates_in_file: number;
  already_in_system: number;
  suppressed: number;
  blocked_domain: number;
};

/**
 * Mirrors public.mail_norm_email so the preview count matches what the server
 * will actually accept: gmail ignores dots and "+tags", other providers ignore
 * "+tags".
 */
function normalizeEmail(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.toLowerCase().trim().split('@');
  const local = rawLocal.split('+')[0];
  if (rawDomain === 'gmail.com' || rawDomain === 'googlemail.com') {
    return `${local.replace(/\./g, '')}@gmail.com`;
  }
  return `${local}@${rawDomain}`;
}

function parseList(text: string): { rows: Parsed[]; dupes: number; skipped: number } {
  const rows: Parsed[] = [];
  const seen = new Set<string>();
  let dupes = 0;
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(EMAIL_RE);
    if (!match) {
      skipped++;
      continue;
    }

    const email = match[0].toLowerCase();
    const key = normalizeEmail(email);
    if (seen.has(key)) {
      dupes++;
      continue;
    }
    seen.add(key);

    // Whatever isn't the address, cleaned of separators, becomes the name.
    const nome = line
      .replace(match[0], '')
      .replace(/[,;\t|]+/g, ' ')
      .replace(/["<>()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    rows.push({ nome, email });
  }

  return { rows, dupes, skipped };
}

const EMPTY: ImportResult = {
  total: 0,
  inserted: 0,
  invalid: 0,
  duplicates_in_file: 0,
  already_in_system: 0,
  suppressed: 0,
  blocked_domain: 0,
};

export default function ImportPanel({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const parsed = useMemo(() => parseList(text), [text]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText((prev) => (prev ? prev + '\n' : '') + String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  async function submit() {
    const rows = parsed.rows;
    if (!rows.length) return;

    setLoading(true);
    setError('');
    setResult(null);

    // Large lists are sent in batches so we stay well under the request size
    // limit and can show progress on a 20k+ import.
    const total = Math.ceil(rows.length / CHUNK);
    const acc: ImportResult = { ...EMPTY };

    try {
      for (let i = 0; i < total; i++) {
        setProgress({ done: i, total });
        const slice = rows.slice(i * CHUNK, (i + 1) * CHUNK);
        const res = await fetch(`/api/campaigns/${campaignId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: slice }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao importar');

        acc.total += json.total ?? 0;
        acc.inserted += json.inserted ?? 0;
        acc.invalid += json.invalid ?? 0;
        acc.duplicates_in_file += json.duplicates_in_file ?? 0;
        acc.already_in_system += json.already_in_system ?? 0;
        acc.suppressed += json.suppressed ?? 0;
        acc.blocked_domain += json.blocked_domain ?? 0;
      }

      // Duplicates the browser already collapsed count too.
      acc.duplicates_in_file += parsed.dupes;
      setResult(acc);
      setText('');
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-900 mb-1">Importar lista</h2>
      <p className="text-sm text-slate-500 mb-3">
        Cole uma linha por contato (<code>Nome, email@dominio.com</code>) ou envie um CSV/TXT.
        Emails repetidos são <b>sempre</b> ignorados: no próprio arquivo, em qualquer outra
        campanha, e quem já cancelou a inscrição ou deu erro nunca volta.
      </p>

      <textarea
        className="input min-h-[120px] font-mono text-xs"
        placeholder={'João Silva, joao@empresa.com\nMaria, maria@empresa.com'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="btn-ghost cursor-pointer">
          Escolher arquivo
          <input type="file" accept=".csv,.txt" className="hidden" onChange={onFile} />
        </label>
        <div className="text-sm text-slate-500">
          {parsed.rows.length.toLocaleString('pt-BR')} único(s)
          {parsed.dupes > 0 && (
            <span className="text-amber-600"> · {parsed.dupes.toLocaleString('pt-BR')} repetido(s)</span>
          )}
          {parsed.skipped > 0 && (
            <span className="text-slate-400"> · {parsed.skipped.toLocaleString('pt-BR')} sem email</span>
          )}
        </div>
        <button className="btn-primary" onClick={submit} disabled={loading || !parsed.rows.length}>
          {loading ? 'Importando…' : 'Importar'}
        </button>
      </div>

      {progress && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Lote {progress.done + 1} de {progress.total}…
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
          <div className="font-semibold text-green-700 mb-1">
            {result.inserted.toLocaleString('pt-BR')} contato(s) adicionado(s)
          </div>
          <ul className="text-xs text-slate-600 space-y-0.5">
            <li>{result.duplicates_in_file.toLocaleString('pt-BR')} repetidos no arquivo</li>
            <li>{result.already_in_system.toLocaleString('pt-BR')} já existiam no sistema</li>
            <li>{result.suppressed.toLocaleString('pt-BR')} bloqueados (descadastrados / inválidos)</li>
            {result.blocked_domain > 0 && (
              <li className="text-amber-700">
                {result.blocked_domain.toLocaleString('pt-BR')} de domínio bloqueado (concorrentes)
              </li>
            )}
            <li>{result.invalid.toLocaleString('pt-BR')} endereços inválidos</li>
          </ul>
        </div>
      )}
    </div>
  );
}
