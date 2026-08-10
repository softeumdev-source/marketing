import { NextResponse } from 'next/server';
import { WORKER_SECRET } from '@/lib/secrets';
import { claimNext, markSent, markFailed, nextReadyIn, type ClaimRow } from '@/lib/worker-db';
import { decrypt } from '@/lib/crypto';
import { makeTransport } from '@/lib/mailer';
import { personalize } from '@/lib/personalize';
import { renderEmail } from '@/lib/email';
import type { Transporter } from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const RESERVE_MS = 4_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    url.searchParams.get('key') ||
    '';
  return provided === WORKER_SECRET;
}

function resolveBase(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

/**
 * The cron fires once a minute, but the real pace is set by each campaign's
 * interval. Rather than claiming once and giving up (which capped throughput at
 * one e-mail per cron tick regardless of the configured interval), this worker
 * asks the database when the next send is due and keeps working inside its
 * budget. When there is genuinely nothing to do it returns straight away.
 */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  const base = resolveBase(req);
  const transports = new Map<string, { t: Transporter; from: string }>();

  let sent = 0;
  let failed = 0;
  let waitedSeconds = 0;
  let misses = 0;
  let reason = 'ok';

  try {
    for (;;) {
      const remaining = BUDGET_MS - (Date.now() - started);
      if (remaining <= RESERVE_MS) {
        reason = 'orcamento-esgotado';
        break;
      }

      let wait: number | null;
      try {
        wait = await nextReadyIn();
      } catch (e) {
        reason = `erro-rpc: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      if (wait === null) {
        // Queue empty, campaign paused, daily cap hit, or outside the window.
        reason = sent > 0 ? 'nada-mais-a-enviar' : 'nada-a-enviar';
        break;
      }

      if (wait > 0) {
        const need = wait * 1000 + 400;
        if (need > remaining - RESERVE_MS) {
          reason = 'proximo-envio-fora-do-orcamento';
          break;
        }
        waitedSeconds += wait;
        await sleep(need);
      }

      let job: ClaimRow | null = null;
      try {
        job = await claimNext();
      } catch (e) {
        reason = `erro-claim: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      if (!job) {
        // Raced with another run, or the state changed between the two calls.
        if (++misses >= 3) {
          reason = 'sem-trabalho-disponivel';
          break;
        }
        await sleep(1_000);
        continue;
      }
      misses = 0;

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
        const { html, text } = renderEmail({
          bodyHtml: body,
          signatureHtml: signature,
          pixelUrl,
        });

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
  } finally {
    for (const { t } of transports.values()) {
      try {
        t.close();
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({
    sent,
    failed,
    waitedSeconds,
    ms: Date.now() - started,
    reason,
  });
}

export const GET = handle;
export const POST = handle;
