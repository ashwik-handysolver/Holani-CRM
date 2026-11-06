import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, MapPin, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { confirmDialog } from '../components/Dialog';
import { useStore } from '../store';
import { Call, Customer } from '../types';
import { Badge, Button, Card, EmptyState, PageHeader, categoryTone, leadTone } from '../components/ui';
import { CustomerForm } from '../components/CustomerForm';
import { inr, relative, shortDate, todayKey } from '../lib/format';
import { navigate } from '../lib/router';

interface Summary {
  calls: number;
  last: Call | null;
  value: number;
  openTasks: number;
  overdue: number;
  complaints: number;
  nextTask: { task: string; dueDate: string } | null;
}

const empty = (): Summary => ({ calls: 0, last: null, value: 0, openTasks: 0, overdue: 0, complaints: 0, nextTask: null });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

type Sort = 'recent' | 'value' | 'action';

const Stat: React.FC<{ label: string; value: React.ReactNode; alert?: boolean }> = ({ label, value, alert }) => (
  <div className="min-w-0">
    <div className={`text-sm font-semibold tabular-nums truncate ${alert ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
    <div className="text-[11px] text-slate-500">{label}</div>
  </div>
);

const CustomerCard: React.FC<{ c: Customer; s: Summary; onDelete: () => void }> = ({ c, s, onDelete }) => {
  const open = () => navigate(`customers/${c.id}`);
  const lead = s.last && s.last.leadQuality !== 'Not a lead' ? s.last.leadQuality : null;
  const alerts = [s.complaints && `${s.complaints} open complaint${s.complaints > 1 ? 's' : ''}`, s.overdue && `${s.overdue} follow-up${s.overdue > 1 ? 's' : ''} overdue`].filter(Boolean);

  return (
    <Card className="relative group min-w-0 flex flex-col transition-all hover:shadow-md hover:border-slate-300">
      <button
        type="button"
        onClick={onDelete}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label={`Delete ${c.name}`}
        title="Delete customer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <div
        role="link"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        className="p-4 flex-1 flex flex-col gap-3 cursor-pointer rounded-xl"
        aria-label={`Open ${c.name}`}
      >
        {/* Who */}
        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-sm font-semibold shrink-0">{initials(c.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">{c.name}</span>
              {lead && (
                <Badge tone={leadTone(lead)} dot>
                  {lead}
                </Badge>
              )}
            </div>
            <div className="text-xs text-slate-500 truncate">{[c.type, c.company].filter(Boolean).join(' · ')}</div>
          </div>
        </div>

        {/* Contact */}
        {(c.phone || c.city) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            {c.phone && (
              <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 hover:text-amber-600">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {c.phone}
              </a>
            )}
            {c.city && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> <span className="truncate">{c.city}</span>
              </span>
            )}
          </div>
        )}

        {/* Last call */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 mt-auto">
          {s.last ? (
            <>
              <span className="text-xs text-slate-500">Last call {relative(s.last.callDate)}</span>
              <Badge tone={categoryTone(s.last.category)}>{s.last.category}</Badge>
            </>
          ) : (
            <span className="text-xs text-slate-500">No recordings yet</span>
          )}
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Recordings" value={s.calls} />
          <Stat label="Discussed" value={s.value ? inr(s.value) : '—'} />
          <Stat label="Open tasks" value={s.openTasks} alert={s.overdue > 0} />
        </div>
      </div>

      {/* Needs attention / next step */}
      {alerts.length > 0 ? (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-rose-100 bg-rose-50 rounded-b-xl text-xs font-medium text-rose-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{alerts.join(' · ')}</span>
        </div>
      ) : s.nextTask ? (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 text-xs text-slate-600">
          <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">
            <span className="text-slate-400">Next ({shortDate(s.nextTask.dueDate)}):</span> {s.nextTask.task}
          </span>
        </div>
      ) : null}
    </Card>
  );
};

export const Customers: React.FC<{ startNew?: boolean }> = ({ startNew }) => {
  const { calls, customers, loaded, deleteCustomer } = useStore();

  const remove = async (c: Customer) => {
    const n = calls.filter((x) => x.customerId === c.id).length;
    const ok = await confirmDialog({
      title: `Delete ${c.name}?`,
      message: n
        ? `This also deletes their ${n} recording${n > 1 ? 's' : ''}, with transcripts and follow-ups. This can’t be undone.`
        : 'This can’t be undone.',
      confirmLabel: 'Delete customer',
      danger: true,
    });
    if (ok) deleteCustomer(c.id);
  };
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [adding, setAdding] = useState(!!startNew);

  const stats = useMemo(() => {
    const today = todayKey();
    const m = new Map<string, Summary>();
    calls.forEach((c) => {
      if (!c.customerId) return;
      const s = m.get(c.customerId) || empty();
      s.calls++;
      s.value += c.orderValue || 0;
      if (!s.last || c.callDate > s.last.callDate) s.last = c;
      if (c.complaint && !c.reviewed) s.complaints++;
      c.actionItems.forEach((a) => {
        if (a.done || a.owner !== 'Company') return;
        s.openTasks++;
        if (a.dueDate && a.dueDate < today) s.overdue++;
        else if (a.dueDate && (!s.nextTask || a.dueDate < s.nextTask.dueDate)) s.nextTask = { task: a.task, dueDate: a.dueDate };
      });
      m.set(c.customerId, s);
    });
    return m;
  }, [calls]);

  if (!loaded) return null;

  const get = (id: string) => stats.get(id) || empty();
  const rows = customers
    .filter((c) => !q || [c.name, c.company, c.city, c.phone].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const sa = get(a.id);
      const sb = get(b.id);
      if (sort === 'value') return sb.value - sa.value;
      if (sort === 'action') return sb.complaints + sb.overdue - (sa.complaints + sa.overdue) || sb.openTasks - sa.openTasks;
      return (sb.last?.callDate || b.createdAt).localeCompare(sa.last?.callDate || a.createdAt);
    });

  return (
    <>
      <PageHeader
        actions={
          !adding && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              New customer
            </Button>
          )
        }
      />

      {adding && <CustomerForm onCancel={() => setAdding(false)} onSaved={(c) => navigate(`customers/${c.id}`)} />}

      {customers.length === 0 ? (
        !adding && (
          <Card>
            <EmptyState
              icon={Users}
              title="Add your first customer"
              text="Create a customer, then upload their call recordings in their profile."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                  New customer
                </Button>
              }
            />
          </Card>
        )
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Filter ${customers.length} customers`}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400"
              />
            </div>
            <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
              {(
                [
                  ['recent', 'Recent'],
                  ['value', 'Top value'],
                  ['action', 'Needs action'],
                ] as [Sort, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSort(v)}
                  className={`px-3 h-8 rounded-lg text-xs font-medium transition-colors ${sort === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No customers match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {rows.map((c) => (
                <CustomerCard key={c.id} c={c} s={get(c.id)} onDelete={() => remove(c)} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
};
