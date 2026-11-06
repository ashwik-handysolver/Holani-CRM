import React, { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, AlertCircle, Frown, Meh, Smile, UploadCloud } from 'lucide-react';
import { useStore } from '../store';
import { Call } from '../types';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, categoryTone } from '../components/ui';
import { callerLabel, dayKey, inr, todayKey } from '../lib/format';
import { navigate } from '../lib/router';
import { PREV_LABEL, Period, inRange, lastPeriods, periodTitle, rangeOf, shiftPeriod } from '../lib/period';
import { norm } from './Products';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
/** Short rupee label for chart axes: ₹950, ₹45k, ₹1.2L, ₹3.4Cr */
const inrShort = (n: number) =>
  n >= 1e7 ? `₹${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${n}`;

// Chart colours come from CSS variables so they switch with the theme (see index.css).
const C = {
  calls: 'var(--viz-1)',
  orders: 'var(--viz-2)',
  bar: 'var(--viz-seq)',
  grid: 'var(--color-slate-100)',
  axis: 'var(--color-slate-400)',
};
const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' },
  labelStyle: { color: 'var(--color-slate-500)', marginBottom: 2 },
  cursor: { fill: 'var(--color-slate-100)' },
};
const axisProps = { tick: { fontSize: 11, fill: C.axis }, axisLine: false, tickLine: false } as const;

// How many buckets the trend charts show for each period.
const TREND: Record<Period, { n: number; label: string }> = {
  day: { n: 14, label: 'last 14 days' },
  week: { n: 8, label: 'last 8 weeks' },
  month: { n: 6, label: 'last 6 months' },
};

/** KPI tile with a mini trend line. */
const Stat: React.FC<{ label: string; value: string | number; hint: string; href: string; spark: number[]; color: string }> = ({ label, value, hint, href, spark, color }) => (
  <a href={href} className="group">
    <Card className="p-4 h-full transition-shadow group-hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="flex items-end justify-between gap-3 mt-1.5">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{hint}</div>
        </div>
        <div className="w-20 h-9 shrink-0" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
              <Area dataKey="v" type="monotoneX" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  </a>
);

/** Horizontal bars with direct labels (one series, so no legend). */
const HBars: React.FC<{ rows: { label: string; value: number; display?: string; sub?: string; href?: string }[]; empty: string; color?: string }> = ({ rows, empty, color = C.bar }) => {
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="px-5 pb-5 space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex justify-between gap-3 text-xs mb-1">
              <span className="text-slate-700 truncate group-hover:text-slate-900">
                {r.label}
                {r.sub && <span className="text-slate-400"> · {r.sub}</span>}
              </span>
              <span className="text-slate-600 font-medium tabular-nums shrink-0">{r.display ?? r.value}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, (r.value / max) * 100)}%`, background: color }} />
            </div>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <a href={r.href} className="block group">
                {inner}
              </a>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** Small two-option toggle used in card headers. */
const Toggle = <T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
    {options.map(([v, label]) => (
      <button
        key={v}
        onClick={() => onChange(v)}
        className={`px-2.5 h-6 rounded-md text-xs font-medium transition-colors ${value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

const MOODS = [
  { key: 'Positive', label: 'Happy', icon: Smile, color: 'var(--status-good)' },
  { key: 'Neutral', label: 'Neutral', icon: Meh, color: 'var(--status-neutral)' },
  { key: 'Negative', label: 'Unhappy', icon: Frown, color: 'var(--status-bad)' },
] as const;

const LEADS = [
  { key: 'Hot', color: 'var(--viz-2)' },
  { key: 'Warm', color: 'var(--viz-4)' },
  { key: 'Cold', color: 'var(--viz-1)' },
] as const;

export const Dashboard: React.FC = () => {
  const { calls, customers, loaded } = useStore();
  const today = todayKey();
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(today);
  const [rankBy, setRankBy] = useState<'value' | 'calls'>('value');

  const s = useMemo(() => {
    const keyed = calls.map((c) => ({ c, k: dayKey(c.callDate) }));
    const within = (r: { start: string; end: string }) => keyed.filter((x) => inRange(x.k, r)).map((x) => x.c);

    const range = rangeOf(period, anchor);
    const list = within(range);
    const prev = within(rangeOf(period, shiftPeriod(period, anchor, -1)));

    const isOrder = (c: Call) => c.category === 'New Order';
    const isHot = (c: Call) => c.leadQuality === 'Hot';
    const isComplaint = (c: Call) => !!c.complaint || c.category === 'Complaint';
    const value = (cs: Call[]) => cs.reduce((n, c) => n + (c.orderValue || 0), 0);

    // Trend buckets (days, weeks or months) ending with the selected one.
    const buckets = lastPeriods(period, anchor, TREND[period].n).map((b) => ({ ...b, calls: within(b.range) }));
    const spark = (fn: (c: Call) => boolean) => buckets.slice(-7).map((b) => b.calls.filter(fn).length);

    const cats = new Map<string, number>();
    const prods = new Map<string, { name: string; n: number }>();
    const cities = new Map<string, { name: string; n: number }>();
    const custs = new Map<string, { calls: number; value: number }>();
    list.forEach((c) => {
      cats.set(c.category, (cats.get(c.category) || 0) + 1);
      const names = new Map<string, string>();
      c.products.forEach((p) => p.name?.trim() && names.set(norm(p.name), p.name.trim()));
      names.forEach((n, k) => prods.set(k, { name: prods.get(k)?.name || n, n: (prods.get(k)?.n || 0) + 1 }));
      const city = c.city?.trim();
      if (city) {
        const ck = city.toLowerCase();
        cities.set(ck, { name: cities.get(ck)?.name || city, n: (cities.get(ck)?.n || 0) + 1 });
      }
      if (c.customerId) {
        const cur = custs.get(c.customerId) || { calls: 0, value: 0 };
        custs.set(c.customerId, { calls: cur.calls + 1, value: cur.value + (c.orderValue || 0) });
      }
    });

    // Calls per hour, trimmed to the working window that has data (at least 9am–7pm).
    const hours = Array(24).fill(0);
    list.forEach((c) => hours[new Date(c.callDate).getHours()]++);
    const used = hours.map((n, h) => (n ? h : -1)).filter((h) => h >= 0);
    const from = Math.min(9, ...used);
    const to = Math.max(19, ...used);

    // Follow-ups from calls in this period. "Overdue" is measured against today.
    const tasks = list.flatMap((c) => c.actionItems.filter((a) => a.owner === 'Company'));
    const done = tasks.filter((t) => t.done).length;
    const overdue = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length;

    const refDay = range.end < today ? range.end : today;
    const due = calls
      .flatMap((c) => c.actionItems.filter((a) => !a.done && a.owner === 'Company').map((a) => ({ ...a, call: c })))
      .filter((t) => t.dueDate && t.dueDate <= refDay)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));

    return {
      range,
      list,
      prevCount: prev.length,
      orders: list.filter(isOrder).length,
      value: value(list),
      prevValue: value(prev),
      hot: list.filter(isHot).length,
      complaints: list.filter(isComplaint).length,
      sparks: { calls: spark(() => true), orders: spark(isOrder), hot: spark(isHot), complaints: spark(isComplaint) },
      trend: buckets.map((b) => ({ anchor: b.anchor, label: b.label, Calls: b.calls.length, Orders: b.calls.filter(isOrder).length, Value: value(b.calls) })),
      hours: hours.slice(from, to + 1).map((n, i) => ({ hour: hourLabel(from + i), calls: n })),
      moods: MOODS.map((m) => ({ ...m, n: list.filter((c) => c.sentiment === m.key).length })),
      leads: LEADS.map((l) => ({ ...l, n: list.filter((c) => c.leadQuality === l.key).length })),
      cats: [...cats].sort((a, b) => b[1] - a[1]).slice(0, 6),
      prods: [...prods.values()].sort((a, b) => b.n - a.n).slice(0, 5),
      cities: [...cities.values()].sort((a, b) => b.n - a.n).slice(0, 6),
      custs,
      health: { total: tasks.length, done, overdue, pending: tasks.length - done - overdue },
      due: due.slice(0, 5),
      dueCount: due.length,
      attention: list.filter((c) => !c.reviewed && (c.priority === 'High' || c.sentiment === 'Negative' || c.leadQuality === 'Hot')).slice(0, 5),
    };
  }, [calls, period, anchor, today]);

  const leaders = useMemo(
    () =>
      customers
        .map((c) => ({ c, ...(s.custs.get(c.id) || { calls: 0, value: 0 }) }))
        .filter((x) => x[rankBy] > 0)
        .sort((a, b) => b[rankBy] - a[rankBy] || b.calls - a.calls)
        .slice(0, 5),
    [customers, s.custs, rankBy],
  );

  if (!loaded) return null;

  if (calls.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={UploadCloud}
          title="Upload your first call recording"
          text="Use the Upload button at the top. Your overview will appear here."
        />
      </Card>
    );
  }

  const atLatest = s.range.end >= today;
  const total = s.list.length;
  const diff = total - s.prevCount;
  const vs = PREV_LABEL[period];
  const leadTotal = s.leads.reduce((n, l) => n + l.n, 0);
  const valueDiff = s.prevValue ? Math.round(((s.value - s.prevValue) / s.prevValue) * 100) : null;
  const h = s.health;
  const pct = (n: number) => (h.total ? Math.round((n / h.total) * 100) : 0);
  const pickBucket = (e: { activeIndex?: unknown } | null) => {
    const pt = s.trend[Number(e?.activeIndex)];
    if (pt) setAnchor(pt.anchor);
  };

  return (
    <>
      {/* Period controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Toggle
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setAnchor(today);
          }}
          options={[
            ['day', 'Day'],
            ['week', 'Week'],
            ['month', 'Month'],
          ]}
        />
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setAnchor(shiftPeriod(period, anchor, -1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Previous">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 min-w-36 text-center text-sm font-semibold text-slate-900">{periodTitle(period, anchor)}</span>
          <button
            onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
            disabled={atLatest}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {!atLatest && (
          <button onClick={() => setAnchor(today)} className="text-xs font-medium text-slate-500 hover:text-slate-900">
            Back to now
          </button>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Calls" value={total} hint={diff === 0 ? `Same as ${vs}` : `${diff > 0 ? '+' : ''}${diff} vs ${vs}`} href="#/calls" spark={s.sparks.calls} color={C.calls} />
        <Stat label="New orders" value={s.orders} hint={s.value ? `${inr(s.value)} discussed` : 'No value mentioned'} href="#/calls?category=New%20Order" spark={s.sparks.orders} color={C.orders} />
        <Stat label="Hot leads" value={s.hot} hint="Ready to buy" href="#/calls" spark={s.sparks.hot} color="var(--viz-4)" />
        <Stat label="Complaints" value={s.complaints} hint="Need a reply" href="#/calls?category=Complaint" spark={s.sparks.complaints} color="var(--status-bad)" />
      </div>

      {/* Trend + mood */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Calls and orders · ${TREND[period].label}`}
            action={
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded" style={{ background: C.calls }} /> Calls
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded" style={{ background: C.orders }} /> Orders
                </span>
              </div>
            }
          />
          <div className="h-56 px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.trend} margin={{ top: 6, right: 16, left: -18, bottom: 0 }} onClick={pickBucket}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis allowDecimals={false} {...axisProps} width={40} />
                <Tooltip {...tooltipStyle} cursor={{ stroke: 'var(--color-slate-300)', strokeWidth: 1 }} />
                <Line dataKey="Calls" type="monotoneX" stroke={C.calls} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} />
                <Line dataKey="Orders" type="monotoneX" stroke={C.orders} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Customer satisfaction" />
          <div className="px-5 pb-5">
            {total === 0 ? (
              <p className="text-sm text-slate-500">No calls in this period.</p>
            ) : (
              <>
                <div className="flex h-3 gap-0.5 rounded-full overflow-hidden" role="img" aria-label={s.moods.map((m) => `${m.label} ${m.n}`).join(', ')}>
                  {s.moods
                    .filter((m) => m.n)
                    .map((m) => (
                      <div key={m.key} title={`${m.label}: ${m.n}`} style={{ width: `${(m.n / total) * 100}%`, background: m.color }} />
                    ))}
                </div>
                <ul className="mt-4 space-y-2">
                  {s.moods.map((m) => (
                    <li key={m.key} className="flex items-center gap-2 text-sm">
                      <m.icon className="w-4 h-4" style={{ color: m.color }} />
                      <span className="flex-1 text-slate-700">{m.label}</span>
                      <span className="tabular-nums text-slate-900 font-medium">{m.n}</span>
                      <span className="w-10 text-right text-xs tabular-nums text-slate-400">{Math.round((m.n / total) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-500 mb-2">Lead quality</div>
              {leadTotal === 0 ? (
                <p className="text-sm text-slate-500">No leads.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {s.leads.map((l) => (
                    <div key={l.key} className="rounded-lg bg-slate-50 px-2 py-2 text-center">
                      <div className="text-lg font-semibold tabular-nums text-slate-900">{l.n}</div>
                      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} /> {l.key}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Order value + follow-up health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Order value · ${TREND[period].label}`}
            action={
              <span className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">{inr(s.value)}</span>
                {valueDiff != null && (
                  <span className={valueDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {' '}
                    {valueDiff >= 0 ? '▲' : '▼'} {Math.abs(valueDiff)}%
                  </span>
                )}
              </span>
            }
          />
          <div className="h-52 px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.trend} margin={{ top: 6, right: 16, left: -4, bottom: 0 }} onClick={pickBucket}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axisProps} width={48} tickFormatter={inrShort} />
                <Tooltip {...tooltipStyle} formatter={(v) => [inr(Number(v)), 'Order value']} />
                <Bar
                  dataKey="Value"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  shape={(p: any) => (
                    <rect x={p.x} y={p.y} width={p.width} height={Math.max(0, p.height)} rx={4} style={{ cursor: 'pointer', fill: C.orders, opacity: p.payload.anchor && rangeOf(period, p.payload.anchor).start === s.range.start ? 1 : 0.45 }} />
                  )}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Follow-up health" />
          <div className="px-5 pb-5">
            {h.total === 0 ? (
              <p className="text-sm text-slate-500">No follow-ups from calls in this period.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-semibold tabular-nums text-slate-900">{pct(h.done)}%</span>
                  <span className="text-xs text-slate-500">
                    done · {h.done} of {h.total}
                  </span>
                </div>
                <div className="flex h-3 gap-0.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={`Done ${h.done}, pending ${h.pending}, overdue ${h.overdue}`}>
                  {h.done > 0 && <div style={{ width: `${pct(h.done)}%`, background: 'var(--status-good)' }} />}
                  {h.pending > 0 && <div style={{ width: `${pct(h.pending)}%`, background: 'var(--status-neutral)' }} />}
                  {h.overdue > 0 && <div style={{ width: `${pct(h.overdue)}%`, background: 'var(--status-bad)' }} />}
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {[
                    { label: 'Done', n: h.done, icon: CheckCircle2, color: 'var(--status-good)' },
                    { label: 'Pending', n: h.pending, icon: Clock, color: 'var(--status-neutral)' },
                    { label: 'Overdue', n: h.overdue, icon: AlertCircle, color: 'var(--status-bad)' },
                  ].map((r) => (
                    <li key={r.label} className="flex items-center gap-2">
                      <r.icon className="w-4 h-4" style={{ color: r.color }} />
                      <span className="flex-1 text-slate-700">{r.label}</span>
                      <span className="tabular-nums font-medium text-slate-900">{r.n}</span>
                    </li>
                  ))}
                </ul>
                <a href="#/followups" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
                  Open follow-ups <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Who, where, when */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader
            title="Top customers"
            action={
              <Toggle
                value={rankBy}
                onChange={setRankBy}
                options={[
                  ['value', '₹ value'],
                  ['calls', 'Calls'],
                ]}
              />
            }
          />
          {leaders.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">{customers.length ? 'No customer calls in this period.' : 'Create customer profiles to see a leaderboard.'}</p>
          ) : (
            <ol className="px-5 pb-5 space-y-3">
              {leaders.map((x, i) => (
                <li key={x.c.id}>
                  <a href={`#/customers/${x.c.id}`} className="flex items-center gap-3 group">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${i === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-900 truncate group-hover:underline">{x.c.name}</span>
                      <span className="block text-xs text-slate-400 truncate">{[x.c.company, x.c.city].filter(Boolean).join(' · ') || x.c.type}</span>
                    </span>
                    <span className="text-sm font-medium tabular-nums text-slate-900">{rankBy === 'value' ? inr(x.value) : `${x.calls} call${x.calls > 1 ? 's' : ''}`}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title="Where calls come from" />
          <HBars
            empty="No city mentioned in these calls."
            color="var(--viz-3)"
            rows={s.cities.map((c) => ({ label: c.name, value: c.n, display: `${c.n}`, sub: `${Math.round((c.n / Math.max(total, 1)) * 100)}%`, href: `#/calls?q=${encodeURIComponent(c.name)}` }))}
          />
        </Card>

        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader title="Busiest hours" />
          <div className="h-44 px-2 pb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.hours} margin={{ top: 4, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
                <XAxis dataKey="hour" {...axisProps} interval={1} />
                <YAxis allowDecimals={false} {...axisProps} width={28} />
                <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Calls']} />
                <Bar dataKey="calls" fill={C.bar} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* What they talked about */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader title="Why they called" />
          <HBars empty="No calls in this period." rows={s.cats.map(([name, n]) => ({ label: name, value: n, href: `#/calls?category=${encodeURIComponent(name)}` }))} />
        </Card>
        <Card>
          <CardHeader title="Top products" action={<a href="#/products" className="text-xs font-medium text-slate-500 hover:text-slate-900">Catalogue</a>} />
          <HBars empty="No products mentioned." color={C.orders} rows={s.prods.map((p) => ({ label: p.name, value: p.n, href: `#/calls?q=${encodeURIComponent(p.name)}` }))} />
        </Card>
      </div>

      {/* Action lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Needs attention" action={<a href="#/calls" className="text-xs font-medium text-slate-500 hover:text-slate-900">All calls</a>} />
          {s.attention.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">Nothing urgent in this period.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {s.attention.map((c) => (
                <li key={c.id}>
                  <a href={`#/calls/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="text-xs text-slate-400 w-20 shrink-0 tabular-nums">{period === 'day' ? time(c.callDate) : new Date(c.callDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">{callerLabel(c)}</span>
                    <Badge tone={categoryTone(c.category)}>{c.category}</Badge>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Follow-ups due" action={<a href="#/followups" className="text-xs font-medium text-slate-500 hover:text-slate-900">{s.dueCount ? `${s.dueCount} total` : 'All'}</a>} />
          {s.due.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">No follow-ups due.</p>
          ) : (
            <ul className="px-5 pb-4 space-y-2.5">
              {s.due.map((t) => {
                const late = t.dueDate! < today;
                return (
                  <li key={t.id}>
                    <a href={`#/calls/${t.call.id}`} className="flex gap-2.5 text-sm">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${late ? 'bg-rose-500' : 'bg-slate-300'}`} />
                      <span className="min-w-0">
                        <span className="block text-slate-800 truncate hover:text-slate-900">{t.task}</span>
                        <span className={`block text-xs ${late ? 'text-rose-600' : 'text-slate-400'}`}>
                          {late ? 'Overdue' : 'Due'} · {callerLabel(t.call)}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
};
