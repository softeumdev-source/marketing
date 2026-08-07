function looksLikeHtml(s: string): boolean {
  return /<[a-z][\s\S]*>/i.test(s);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function block(s: string): string {
  return looksLikeHtml(s)
    ? s
    : `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${esc(
        s
      )}</div>`;
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

// Builds the multipart email: HTML + plaintext alternative, with an optional
// auto-appended signature, an unsubscribe footer, and an optional tracking pixel.
export function renderEmail(opts: {
  bodyHtml: string; // already personalized (plain text or HTML)
  signatureHtml?: string;
  pixelUrl?: string; // include only when open-tracking is enabled
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const bodyBlock = block(opts.bodyHtml);

  const sig =
    opts.signatureHtml && opts.signatureHtml.trim()
      ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #eaeaea">${block(
          opts.signatureHtml
        )}</div>`
      : '';

  const unsub = `<div style="margin-top:20px;font-size:12px;color:#9aa0a6;font-family:Arial,Helvetica,sans-serif">Se não quiser mais receber estes emails, <a href="${opts.unsubscribeUrl}" style="color:#9aa0a6">clique aqui para descadastrar</a>.</div>`;

  const pixel = opts.pixelUrl
    ? `<img src="${opts.pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`
    : '';

  const html = `<!doctype html><html><body style="margin:0;padding:0">${bodyBlock}${sig}${unsub}${pixel}</body></html>`;

  const textBody = looksLikeHtml(opts.bodyHtml) ? stripHtml(opts.bodyHtml) : opts.bodyHtml;
  const textSig = opts.signatureHtml
    ? looksLikeHtml(opts.signatureHtml)
      ? stripHtml(opts.signatureHtml)
      : opts.signatureHtml
    : '';
  const text = [textBody, textSig, `Para não receber mais estes emails: ${opts.unsubscribeUrl}`]
    .filter((p) => p && p.trim())
    .join('\n\n');

  return { html, text };
}
