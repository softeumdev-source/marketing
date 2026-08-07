function looksLikeHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Converts plain text into real HTML paragraphs so it renders cleanly (1:1 look)
// in every client. Blank lines -> new paragraph; single newline -> <br>.
function textToParagraphs(s: string): string {
  const escaped = esc(s.replace(/\r\n/g, '\n')).trim();
  if (!escaped) return '';
  return escaped
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 15px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222">${p.replace(
          /\n/g,
          '<br/>'
        )}</p>`
    )
    .join('');
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Builds a clean, personal (1:1-looking) email: HTML + plaintext alternative,
// with the account signature appended and an optional tracking pixel.
// The unsubscribe mechanism is carried by the List-Unsubscribe header (set in the
// send route) — no visible marketing footer, to keep the personal look.
export function renderEmail(opts: {
  bodyHtml: string; // already personalized (plain text or HTML)
  signatureHtml?: string;
  pixelUrl?: string; // include only when open-tracking is enabled
}): { html: string; text: string } {
  const bodyContent = looksLikeHtml(opts.bodyHtml)
    ? opts.bodyHtml
    : textToParagraphs(opts.bodyHtml);

  const sigRaw = (opts.signatureHtml || '').trim();
  const sigContent = sigRaw
    ? `<div style="margin-top:6px">${looksLikeHtml(sigRaw) ? sigRaw : textToParagraphs(sigRaw)}</div>`
    : '';

  const pixel = opts.pixelUrl
    ? `<img src="${opts.pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`
    : '';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">${bodyContent}${sigContent}${pixel}</body></html>`;

  const textBody = looksLikeHtml(opts.bodyHtml) ? stripHtml(opts.bodyHtml) : opts.bodyHtml.trim();
  const textSig = sigRaw ? (looksLikeHtml(sigRaw) ? stripHtml(sigRaw) : sigRaw) : '';
  const text = [textBody, textSig].filter((p) => p && p.trim()).join('\n\n');

  return { html, text };
}
