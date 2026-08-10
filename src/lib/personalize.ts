// Whole-name placeholders a spreadsheet leaves behind instead of a real name.
const PLACEHOLDER_NAMES =
  /^(sem ?nome|nao ?informado|não ?informado|nao ?tem|não ?tem|nome|company ?name|desconhecido|null|nulo|n\/?a|teste)$/i;

// A department or a company is not someone to greet by name.
const ROLE_WORDS =
  /^(comercial|comercio|comércio|vendas|financeiro|compras|marketing|diretoria|administrativo|adm|atendimento|logistica|logística|sac|rh|ti|contato|contabilidade|fiscal|qualidade|suporte|clientes?|grupo|group|familia|família|industria|indústria|distribuidora|transportes|equipe|empresa|loja|matriz|filial)$/i;

// Legal-entity markers: the name column holds a company, not a person.
// \b is ASCII-only, so accented words need explicit Unicode boundaries.
const CORPORATE_NAME =
  /(?<!\p{L})(ltda|s\/a|eireli|epp|cnpj|inc|corp|llc|gmbh|srl|pty|comercio|comércio|industria|indústria|distribuidora|representacoes|representações|supermercado|alimentos|tecnologia|servicos|serviços)(?!\p{L})/iu;

// Portuguese name particles stay lowercase when we recase a name.
const PARTICLES =
  /^(da|de|do|das|dos|e|di|du|del|van|von|der|la|le|bin)$/i;

// Imported lists put anything in the name column: "-", ".", "TESTE",
// the e-mail address itself, a truncated copy of it, or the company name.
// Greeting a lead with "Olá dispatch@barnettrefrig.com," burns the lead;
// "Olá, tudo bem?" costs nothing. When in doubt, drop the name.
export function cleanName(name: string, email?: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  if (CORPORATE_NAME.test(raw)) return '';

  const tokens = raw
    .split(/\s+/)
    .filter((token) => !token.includes('@')) // an address pasted into the name
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .map((token) =>
      // "agatha.pai" / "nerio.danelli": an e-mail local part, not a name
      /^\p{L}+\.\p{L}+$/u.test(token) ? token.split('.')[0] : token
    )
    .filter((token) => /\p{L}{2}/u.test(token) && !/^testes?$/i.test(token))
    .map((token) => {
      // "Olá ADEMILSON" and "Olá agatha" both read as a mail merge gone wrong.
      if (PARTICLES.test(token)) return token.toLowerCase();
      const body =
        token === token.toUpperCase() ? token.slice(1).toLowerCase() : token.slice(1);
      return token[0].toUpperCase() + body;
    });

  const first = tokens[0];
  if (!first) return '';
  if (PLACEHOLDER_NAMES.test(first) || ROLE_WORDS.test(first)) return '';

  // "Teramon" in teramon@grupoteramon.com is the company, not the person.
  const domain = (email || '').split('@')[1] || '';
  const key = first.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.length >= 4 && domain.toLowerCase().includes(key)) return '';

  return tokens.join(' ');
}

export function firstName(name: string, email?: string): string {
  return cleanName(name, email).split(/\s+/)[0] || '';
}

// Replaces {{nome}}, {{primeiro_nome}}, {{email}} (case-insensitive) in a template.
export function personalize(
  tpl: string,
  vars: { nome?: string; email?: string }
): string {
  const map: Record<string, string> = {
    nome: cleanName(vars.nome || '', vars.email),
    primeiro_nome: firstName(vars.nome || '', vars.email),
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
