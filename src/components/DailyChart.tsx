import type { DaySeries } from '@/lib/dashboard';
import { fmtInt } from '@/components/ui';

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= n) return m * mag;
  }
  return 10 * mag;
}

// The series dates are plain YYYY-MM-DD in the account's timezone — parsing them
// as Dates would shift them by the browser's UTC offset.
function dayLabel(d: string): string {
  const [, m, dd] = d.split('-');
  return `${dd}/${m}`;
}

/**
 * Sends per day. One measure, one hue, one axis — opens and bounces live in the
 * tooltip rather than fighting the bars for a second scale.
 */
export default function DailyChart({ series, tz }: { series: DaySeries[]; tz: string }) {
  if (!series.length) return null;

  const peak = Math.max(...series.map((d) => d.sent));
  const top = niceCeil(peak);
  const ticks = [0, top / 2, top];

  const maxIdx = series.reduce((best, d, i) => (d.sent > series[best].sent ? i : best), 0);
  const lastIdx = series.length - 1;
  const labelled = new Set([maxIdx, lastIdx]);
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-900">Envios por dia</h2>
      <p className="text-xs text-slate-400 mt-0.5">
        Últimos {series.length} dias · fuso {tz} · passe o mouse para o detalhe
      </p>

      <div className="mt-5 flex gap-2">
        <div className="relative h-44 w-9 shrink-0">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute right-0 translate-y-1/2 text-[10px] text-slate-400"
              style={{ bottom: `${(t / top) * 100}%`, fontVariantNumeric: 'tabular-nums' }}
            >
              {fmtInt(t)}
            </div>
          ))}
        </div>

        <div className="relative h-44 flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-slate-100"
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((d, i) => {
              const h = d.sent > 0 ? Math.max((d.sent / top) * 100, 1.5) : 0;
              return (
                <div
                  key={d.d}
                  className="group relative flex h-full flex-1 items-end justify-center"
                >
                  {labelled.has(i) && d.sent > 0 && (
                    <div
                      className="absolute w-full text-center text-[10px] font-semibold text-slate-500"
                      style={{ bottom: `calc(${h}% + 3px)` }}
                    >
                      {fmtInt(d.sent)}
                    </div>
                  )}

                  {d.sent > 0 && (
                    <div
                      className="w-full max-w-[24px] rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-600"
                      style={{ height: `${h}%` }}
                    />
                  )}

                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-lg group-hover:block">
                    <div className="mb-1 text-xs font-semibold text-slate-900">
                      {dayLabel(d.d)}
                    </div>
                    <dl className="space-y-0.5 text-[11px] text-slate-600">
                      <Row label="Enviados" value={d.sent} />
                      <Row label="Aberturas reais" value={d.opens} />
                      <Row label="Respostas" value={d.replies} />
                      <Row label="Inválidos" value={d.bounces} />
                      <Row label="Descadastros" value={d.unsubs} />
                      <Row label="Falhas" value={d.failed} />
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-[2px] pl-11">
        {series.map((d, i) => (
          <div key={d.d} className="flex-1 text-center text-[10px] text-slate-400">
            {i % labelEvery === 0 || i === lastIdx ? dayLabel(d.d) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {fmtInt(value)}
      </dd>
    </div>
  );
}
