// Whole-name placeholders a spreadsheet leaves behind instead of a real name.
const PLACEHOLDER_NAMES =
  /^(sem ?nome|nao ?informado|não ?informado|nao ?tem|não ?tem|nome|cliente|contato|empresa|company ?name|desconhecido|null|nulo|n\/?a|teste)$/i;

// Imported lists carry junk in the name column: "-", ".", "*", "TESTE".
// Greeting a lead with "Olá -," is worse than not naming them at all.
export function cleanName(name: string): string {
  const cleaned = (name || '')
    .trim()
    .split(/\s+/)
    .filter((token) => /\p{L}{2}/u.test(token) && !/^testes?$/i.test(token))
    .join(' ');
  return PLACEHOLDER_NAMES.test(cleaned) ? '' : cleaned;
}

export function firstName(name: string): string {
  return cleanName(name).split(/\s+/)[0] || '';
}

// Replaces {{nome}}, {{primeiro_nome}}, {{email}} (case-insensitive) in a template.
export function personalize(
  tpl: string,
  vars: { nome?: string; email?: string }
): string {
  const map: Record<string, string> = {
    nome: cleanName(vars.nome || ''),
    primeiro_nome: firstName(vars.nome || ''),
    email: vars.email || '',
  };
  let emptied = false;
  const out = (tpl || '').replace(
    /\{\{\s*([a-zA-Z_]+)\s*\}\}/g,
    (_m, k: string) => {
      const key = k.toLowerCase();
      if (!(key in map)) return _m;
      if (map[key] === '') emptied = true;
      return map[key];
    }
  );
  // An empty variable leaves the punctuation stranded ("Olá , tudo bem?").
  return emptied ? out.replace(/[ \t]+([,.!?;:])/g, '$1') : out;
}

// Wrap plaintext bodies in minimal HTML and append the tracking pixel.
export function buildHtml(bodyHtml: string, pixelUrl: string): string {
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(bodyHtml);
  const inner = looksLikeHtml
    ? bodyHtml
    : `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${escapeHtml(
        bodyHtml
      )}</div>`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`;
  return `<!doctype html><html><body>${inner}${pixel}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
