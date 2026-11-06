import { dayKey, shortDate, todayKey } from './format';

export type Period = 'day' | 'week' | 'month';
export interface Range {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

const d = (key: string) => new Date(key + 'T12:00:00');
const k = (date: Date) => dayKey(date.toISOString());

export const addDays = (key: string, n: number) => {
  const x = d(key);
  x.setDate(x.getDate() + n);
  return k(x);
};

/** The day, Monday-start week, or calendar month containing `anchor`. */
export function rangeOf(period: Period, anchor: string): Range {
  if (period === 'day') return { start: anchor, end: anchor };
  if (period === 'week') {
    const x = d(anchor);
    const start = addDays(anchor, -((x.getDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  const x = d(anchor);
  return { start: k(new Date(x.getFullYear(), x.getMonth(), 1, 12)), end: k(new Date(x.getFullYear(), x.getMonth() + 1, 0, 12)) };
}

/** Move the anchor by n whole periods. */
export function shiftPeriod(period: Period, anchor: string, n: number) {
  if (period === 'day') return addDays(anchor, n);
  if (period === 'week') return addDays(anchor, n * 7);
  const x = d(rangeOf('month', anchor).start);
  return k(new Date(x.getFullYear(), x.getMonth() + n, 1, 12));
}

export const inRange = (key: string, r: Range) => key >= r.start && key <= r.end;

/** The last `n` periods ending with the one containing `anchor`, oldest first. */
export const lastPeriods = (period: Period, anchor: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = shiftPeriod(period, anchor, i - (n - 1));
    return { anchor: a, range: rangeOf(period, a), label: bucketLabel(period, a) };
  });

export function bucketLabel(period: Period, anchor: string) {
  if (period === 'day') return shortDate(anchor);
  if (period === 'week') return shortDate(rangeOf('week', anchor).start);
  return d(anchor).toLocaleDateString('en-IN', { month: 'short' });
}

/** Human title for the selected period, e.g. "Today", "This week", "14 – 20 Oct", "October 2026". */
export function periodTitle(period: Period, anchor: string) {
  const today = todayKey();
  const r = rangeOf(period, anchor);
  const current = inRange(today, r);
  if (period === 'day') {
    if (anchor === today) return 'Today';
    if (anchor === addDays(today, -1)) return 'Yesterday';
    return d(anchor).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (period === 'week') return current ? 'This week' : `${shortDate(r.start)} – ${shortDate(r.end)}`;
  return current ? 'This month' : d(anchor).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const PREV_LABEL: Record<Period, string> = { day: 'day before', week: 'last week', month: 'last month' };
