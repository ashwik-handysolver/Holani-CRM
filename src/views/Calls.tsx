import React, { useMemo, useState } from 'react';
import { Search, PhoneCall, Download, Circle, CalendarDays, Tag, Flag } from 'lucide-react';
import { useStore } from '../store';
import { Call, Category } from '../types';
import { Badge, Button, Card, EmptyState, PageHeader, categoryTone, leadTone, priorityTone, sentimentTone } from '../components/ui';
import { Dropdown } from '../components/Dropdown';
import { callerLabel, dateTime, dayKey, duration, inr, todayKey } from '../lib/format';
import { navigate } from '../lib/router';

const CATEGORIES: Category[] = ['New Order', 'Price Inquiry', 'Product Inquiry', 'Complaint', 'Service Request', 'Payment', 'Dealership Inquiry', 'Follow-up', 'Other'];

const matches = (c: Call, q: string) => {
  if (!q) return true;
  const hay = [c.callerName, c.companyName, c.city, c.phone, c.summary, c.fileName, ...c.products.map((p) => p.name), ...c.transcript.map((t) => t.text)]
    .join(' ')
    .toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
};

const inRange = (c: Call, range: string) => {
  if (range === 'all') return true;
  if (range === 'today') return dayKey(c.callDate) === todayKey();
  const days = Number(range);
  return Date.now() - new Date(c.callDate).getTime() < days * 86400000;
};

function exportCsv(rows: Call[]) {
  const head = ['Date', 'Caller', 'Company', 'City', 'Phone', 'Type', 'Category', 'Priority', 'Lead', 'Sentiment', 'Order value', 'Products', 'Summary', 'Open tasks'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((c) =>
    [
      dateTime(c.callDate),
      c.callerName,
      c.companyName,
      c.city,
      c.phone,
      c.callerType,
      c.category,
      c.priority,
      c.leadQuality,
      c.sentiment,
      c.orderValue ?? '',
      c.products.map((p) => `${p.name}${p.quantity ? ` (${p.quantity})` : ''}`).join('; '),
      c.summary,
      c.actionItems.filter((a) => !a.done).map((a) => a.task).join('; '),
    ]
      .map(esc)
      .join(','),
  );
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `calls-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const Calls: React.FC<{ initialQuery?: string; initialCategory?: string; initialRange?: string }> = ({ initialQuery, initialCategory, initialRange }) => {
  const { calls, loaded } = useStore();
  const [q, setQ] = useState(initialQuery || '');
  const [range, setRange] = useState(initialRange || 'all');
  const [category, setCategory] = useState(initialCategory || '');
  const [priority, setPriority] = useState('');
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);

  const rows = useMemo(
    () =>
      calls.filter(
        (c) =>
          inRange(c, range) &&
          (!category || c.category === category) &&
          (!priority || c.priority === priority) &&
          (!onlyUnreviewed || !c.reviewed) &&
          matches(c, q),
      ),
    [calls, q, range, category, priority, onlyUnreviewed],
  );

  if (loaded && calls.length === 0) {
    return (
      <>
        <PageHeader title="Calls" />
        <Card>
          <EmptyState
            icon={PhoneCall}
            title="No calls yet"
            text="Use the Upload button at the top to add a recording."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Calls"
        actions={
          <Button icon={Download} onClick={() => exportCsv(rows)} disabled={!rows.length}>
            Export CSV
          </Button>
        }
      />

      <Card className="p-3 mb-4 flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search caller, company, city, product, or anything said in the call…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm placeholder:text-slate-400 hover:border-slate-300 focus:border-amber-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Dropdown
            label="Date"
            icon={CalendarDays}
            value={range}
            defaultValue="all"
            onChange={setRange}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
          <Dropdown
            label="Category"
            icon={Tag}
            value={category}
            defaultValue=""
            onChange={setCategory}
            options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
          <Dropdown
            label="Priority"
            icon={Flag}
            value={priority}
            defaultValue=""
            onChange={setPriority}
            options={[
              { value: '', label: 'Any priority' },
              { value: 'High', label: 'High', dot: 'var(--status-bad)' },
              { value: 'Medium', label: 'Medium', dot: 'var(--viz-4)' },
              { value: 'Low', label: 'Low', dot: 'var(--status-neutral)' },
            ]}
          />
          <label className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} className="accent-amber-500" />
            Not reviewed
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={Search} title="No matching calls" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => {
              const open = c.actionItems.filter((a) => !a.done && a.owner === 'Company').length;
              return (
                <li key={c.id}>
                  <a href={`#/calls/${c.id}`} className="flex gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors">
                    <Circle className={`w-2 h-2 mt-2 shrink-0 ${c.reviewed ? 'text-transparent' : 'text-amber-500 fill-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">{callerLabel(c)}</span>
                        {c.companyName && c.callerName && <span className="text-sm text-slate-500">· {c.companyName}</span>}
                        {c.city && <span className="text-sm text-slate-400">· {c.city}</span>}
                      </div>
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">{c.summary}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge tone={categoryTone(c.category)}>{c.category}</Badge>
                        {c.priority === 'High' && <Badge tone={priorityTone(c.priority)}>High priority</Badge>}
                        {(c.leadQuality === 'Hot' || c.leadQuality === 'Warm') && <Badge tone={leadTone(c.leadQuality)}>{c.leadQuality} lead</Badge>}
                        {c.sentiment === 'Negative' && <Badge tone={sentimentTone(c.sentiment)}>Unhappy</Badge>}
                        {open > 0 && <Badge tone="amber">{open} to do</Badge>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <div className="text-xs text-slate-500">{dateTime(c.callDate)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{duration(c.durationSec)}</div>
                      {c.orderValue != null && <div className="text-sm font-semibold text-slate-900 mt-2">{inr(c.orderValue)}</div>}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
};
