import { createAnonClient } from '@/lib/supabase-anon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(_req: Request, { params }: { params: { trackingId: string } }) {
  try {
    const sb = createAnonClient();
    await sb.rpc('mail_register_open', { p_tracking: params.trackingId });
  } catch {
    // never block the pixel on tracking errors
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
