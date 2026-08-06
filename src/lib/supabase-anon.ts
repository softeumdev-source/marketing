import { createClient as createSb } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './public-config';

// Sessionless client used by the background worker (cron) and the tracking
// pixel. All privileged operations go through SECURITY DEFINER RPCs gated by
// the worker secret, so the anon key is sufficient and never touches tables.
export function createAnonClient() {
  return createSb(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
