import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useStore } from '../store';

interface ProviderUsage {
  key: string;
  used: number;
  limit: number | null;
  left: number | null;
}
interface Usage {
  used: number;
  providers: ProviderUsage[];
  since: string;
}

const META: Record<string, { name: string; color: string }> = {
  sarvam: { name: 'Sarvam', color: 'var(--viz-1)' },
};

const compact = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n));
const share = (p: ProviderUsage) => (p.limit ? Math.min(100, (p.used / p.limit) * 100) : 0);
const isLow = (p: ProviderUsage) => p.limit != null && share(p) >= 90;

/** AI tokens used (and left, when SARVAM_TOKEN_LIMIT is set), shown in the header. */
export const UsageMeter: React.FC = () => {
  const { queue } = useStore();
  const [u, setU] = useState<Usage | null>(null);
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(false); // tap to open on touch screens
  const finished = queue.filter((q) => q.status === 'done' || q.status === 'error').length;

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/usage')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (!alive) return;
          setU(Array.isArray(d?.providers) ? d : null);
          setOffline(!Array.isArray(d?.providers));
        })
        .catch(() => alive && setOffline(true));
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('callsense:usage', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('callsense:usage', load);
    };
  }, [finished]);

  // The server can't report usage (usually it's still running old code and needs a restart).
  if (!u) {
    if (!offline) return null;
    const hint = 'Token count unavailable. Restart the server (npm run dev) to start counting AI tokens.';
    return (
      <div title={hint} aria-label={hint} className="flex items-center gap-2 h-10 px-3 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 shrink-0">
        <Gauge className="w-4 h-4" />
        <span className="max-sm:hidden">Tokens —</span>
      </div>
    );
  }

  // The chip shows whichever AI with a limit is closest to running out.
  const limited = u.providers.filter((p) => p.limit != null);
  const tightest = limited.sort((a, b) => share(b) - share(a))[0];
  const anyLow = u.providers.some(isLow);
  const summary = u.providers
    .map((p) => `${META[p.key]?.name || p.key}: ${p.used.toLocaleString('en-IN')} used${p.left != null ? `, ${p.left.toLocaleString('en-IN')} left` : ''}`)
    .join('. ');

  return (
    <div className="relative group shrink-0" onMouseLeave={() => setOpen(false)}>
      {/* Chip */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`AI tokens. ${summary}. Show details`}
        className="flex items-center gap-1.5 sm:gap-2 h-10 px-2 sm:px-3 rounded-xl border border-slate-200 bg-white text-xs hover:border-slate-300"
      >
        <Gauge className={`w-4 h-4 ${anyLow ? 'text-rose-500' : 'text-slate-400'}`} />
        <span className="leading-tight text-left">
          <span className="block tabular-nums text-slate-900 font-semibold">
            {compact(u.used)} <span className="font-normal text-slate-500 max-sm:hidden">used</span>
          </span>
          {tightest && (
            <span className="block mt-1 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${share(tightest)}%`, background: isLow(tightest) ? 'var(--status-bad)' : META[tightest.key]?.color }} />
            </span>
          )}
        </span>
      </button>

      {/* Strip: one row per AI, on hover, keyboard focus, or tap */}
      <div role="tooltip" className={`absolute right-0 top-full pt-2 z-50 ${open ? 'block' : 'hidden group-hover:block group-focus-within:block'}`}>
        <div className="flex flex-col gap-2.5 w-56 rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-xs tabular-nums">
          {u.providers.map((p) => {
            const meta = META[p.key] || { name: p.key, color: 'var(--viz-3)' };
            const low = isLow(p);
            return (
              <div key={p.key}>
                <div className="flex items-center justify-between gap-2 text-slate-500">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    {meta.name}
                  </span>
                  <span>
                    <span className="font-semibold text-slate-900">{compact(p.used)}</span> used
                  </span>
                </div>
                {p.limit != null ? (
                  <>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${meta.name}: ${Math.round(share(p))}% of limit used`}>
                      <div className="h-full rounded-full" style={{ width: `${share(p)}%`, background: low ? 'var(--status-bad)' : meta.color }} />
                    </div>
                    <div className="mt-0.5 text-right text-slate-500">
                      <span className={`font-semibold ${low ? 'text-rose-600' : 'text-slate-900'}`}>{compact(p.left!)}</span> left of {compact(p.limit)}
                    </div>
                  </>
                ) : (
                  <div className="mt-0.5 text-right text-slate-400">no limit set</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
