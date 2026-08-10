import { STATUS_LABEL, STATUS_COLOR } from '@/lib/format';

export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('pt-BR');
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

/**
 * The one number the dashboard leads with. Exactly one per view.
 */
export function HeroStat({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="card p-6">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-5xl font-semibold leading-none text-slate-900">{value}</div>
      {hint && <div className="mt-2 text-sm text-slate-500">{hint}</div>}
      {children}
    </div>
  );
}

/**
 * A single ratio against a limit. The unfilled track is a lighter step of the
 * same ramp, so the state reads across the whole bar.
 */
export function Meter({
  value,
  max,
  className = '',
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.round((value / safeMax) * 100));
  const fill = pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-brand-500';
  const track = pct >= 100 ? 'bg-red-100' : pct >= 90 ? 'bg-amber-100' : 'bg-brand-100';
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${track} ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: 'bg-brand-50 border-brand-100 text-brand-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  } as const;
  return (
    <div className={`rounded-xl border p-4 text-sm ${tones[tone]}`}>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 leading-relaxed">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
