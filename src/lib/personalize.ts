export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

// Replaces {{nome}}, {{primeiro_nome}}, {{email}} (case-insensitive) in a template.
export function personalize(
  tpl: string,
  vars: { nome?: string; email?: string }
): string {
  const map: Record<string, string> = {
    nome: vars.nome || '',
    primeiro_nome: firstName(vars.nome || ''),
    email: vars.email || '',
  };
  return (tpl || '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, k: string) => {
    const key = k.toLowerCase();
    return key in map ? map[key] : _m;
  });
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
