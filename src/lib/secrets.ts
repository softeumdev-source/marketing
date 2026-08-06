import 'server-only';

// Server-only secrets. Defaults let the app run out of the box; override on
// Vercel (Project Settings -> Environment Variables) to harden in production.
//
// ENCRYPTION_KEY: 32-byte hex, used to AES-256-GCM encrypt Gmail app passwords.
export const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  'a69718c8d3e529e003c435a04a6176de6b4aa78e56c7090bd0d7a1194f058ceb';

// WORKER_SECRET: gates the SECURITY DEFINER RPCs and the /api/cron/* endpoints.
// Must match public.mail_settings.worker_secret in the database.
export const WORKER_SECRET =
  process.env.CRON_SECRET ||
  process.env.WORKER_SECRET ||
  '5abc044a8dd24410e895bee11442295eee930fb968b7c352';
