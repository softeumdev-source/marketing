import { NextResponse } from 'next/server';
import { WORKER_SECRET } from '@/lib/secrets';
import { claimNext, markSent, markFailed, type ClaimRow } from '@/lib/worker-db';
import { decrypt } from '@/lib/crypto';
import { makeTransport } from '@/lib/mailer';
import { personalize } from '@/lib/personalize';
import { renderEmail } from '@/lib/email';
import type { Transporter } from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    url.searchParams.get('key') ||
    '';
  return provided === WORKER_SECRET;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const base = `https://${req.headers.get('host')}`;
  const BATCH = 12;
  const transports = new Map<string, { t: Transporter; from: string }>();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < BATCH; i++) {
    let job: ClaimRow | null = null;
    try {
      job = await claimNext();
    } catch {
      break;
    }
    if (!job) break;

    try {
      let entry = transports.get(job.account_id);
      if (!entry) {
        const pass = decrypt(job.account_password_enc);
        const t = makeTransport(job.account_email, pass);
        const fromName = job.from_name || job.account_display_name || job.account_email;
        entry = { t, from: `${fromName} <${job.account_email}>` };
        transports.set(job.account_id, entry);
      }

      const vars = { nome: job.contact_name, email: job.contact_email };
      const subject = personalize(job.subject, vars);
      const body = personalize(job.body_html, vars);
      const signature = personalize(job.account_signature || '', vars);
      const unsubscribeUrl = `${base}/api/unsubscribe?c=${job.tracking_id}`;
      const pixelUrl = job.track_opens ? `${base}/api/track/${job.tracking_id}` : undefined;
      const { html, text } = renderEmail({ bodyHtml: body, signatureHtml: signature, pixelUrl, unsubscribeUrl });

      const info = await entry.t.sendMail({
        from: entry.from,
        to: job.contact_email,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${job.account_email}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await markSent(job.contact_id, info.messageId || '');
      sent++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(job.contact_id, msg);
      failed++;
    }
  }

  for (const { t } of transports.values()) {
    try {
      t.close();
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ sent, failed });
}

export const GET = handle;
export const POST = handle;
