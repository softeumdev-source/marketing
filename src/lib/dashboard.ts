import { createClient } from './supabase-server';

export type DaySeries = {
  d: string;
  sent: number;
  opens: number;
  prefetch: number;
  bounces: number;
  replies: number;
  failed: number;
  unsubs: number;
};

export type DashboardAccount = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  sent_today: number;
  daily_limit: number;
  remaining: number;
  last_send_at: string | null;
  last_scan_at: string | null;
  scan_error: string | null;
  last_error: string | null;
};

export type DashboardCampaign = {
  id: string;
  name: string;
  status: string;
  daily_limit: number;
  sent_today: number;
  sent_count: number;
  interval_seconds: number;
  last_send_at: string | null;
  gmail_account_id: string | null;
  pending: number;
  total: number;
};

export type DashboardData = {
  tz: string;
  now_local: string;
  today: string;
  in_window: boolean;
  window: {
    start: string;
    end: string;
    weekdays_only: boolean;
    jitter_seconds: number;
  };
  today_stats: {
    sent: number;
    opens: number;
    prefetch: number;
    bounces: number;
    replies: number;
    failed: number;
    unsubs: number;
  };
  queue: {
    total: number;
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    bounced: number;
    replied: number;
    unsubscribed: number;
    opened: number;
    retry_queued: number;
  };
  suppressed: number;
  capacity: { limit_today: number; sent_today: number; remaining_today: number };
  accounts: DashboardAccount[];
  series: DaySeries[];
  campaigns: DashboardCampaign[];
  eta: {
    pending: number;
    avg_per_day: number;
    days_left: number | null;
    finish_date: string | null;
  };
};

export type MailSettings = {
  timezone: string;
  send_window_start: string;
  send_window_end: string;
  send_weekdays_only: boolean;
  jitter_seconds: number;
  open_min_delay_seconds: number;
  max_attempts: number;
  app_base_url: string | null;
  secret_is_default: boolean;
};

export async function getDashboard(days = 14): Promise<DashboardData | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('mail_dashboard', { p_days: days });
  if (error || !data) return null;
  return data as DashboardData;
}

export async function getSettings(): Promise<MailSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('mail_get_settings');
  if (error || !data) return null;
  return data as MailSettings;
}
