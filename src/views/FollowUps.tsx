import React, { useMemo, useState } from 'react';
import { Circle, CheckCircle2, ListChecks } from 'lucide-react';
import { useStore } from '../store';
import { ActionItem, Call } from '../types';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { callerLabel, shortDate, todayKey } from '../lib/format';

type Row = ActionItem & { call: Call };

export const FollowUps: React.FC = () => {
  const { calls, updateCall } = useStore();
  const [showDone, setShowDone] = useState(false);
  const [whose, setWhose] = useState<'Company' | 'all'>('Company');

  const groups = useMemo(() => {
    const today = todayKey();
    const rows: Row[] = calls.flatMap((c) => c.actionItems.map((a) => ({ ...a, call: c })));
    const open = rows.filter((r) => !r.done && (whose === 'all' || r.owner === whose));
    const byDate = (a: Row, b: Row) => (a.dueDate || '').localeCompare(b.dueDate || '');
    return {
      groups: [
        { title: 'Overdue', tone: 'text-rose-600', rows: open.filter((r) => r.dueDate && r.dueDate < today).sort(byDate) },
        { title: 'Due today', tone: 'text-amber-600', rows: open.filter((r) => r.dueDate === today) },
        { title: 'Upcoming', tone: 'text-slate-700', rows: open.filter((r) => r.dueDate && r.dueDate > today).sort(byDate) },
        { title: 'No due date', tone: 'text-slate-500', rows: open.filter((r) => !r.dueDate) },
      ],
      done: rows.filter((r) => r.done),
      openCount: open.length,
    };
  }, [calls, whose]);

  const toggle = (r: Row) => updateCall({ ...r.call, actionItems: r.call.actionItems.map((a) => (a.id === r.id ? { ...a, done: !a.done } : a)) });

  const Item: React.FC<{ r: Row }> = ({ r }) => (
    <li className="flex gap-3 px-5 py-3">
      <button onClick={() => toggle(r)} aria-label={r.done ? 'Mark not done' : 'Mark done'} className="mt-0.5">
        {r.done ? <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500" /> : <Circle className="w-[18px] h-[18px] text-slate-300 hover:text-slate-500" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${r.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{r.task}</div>
        <a href={`#/calls/${r.call.id}`} className="text-xs text-slate-500 hover:text-slate-900">
          {callerLabel(r.call)}
          {r.call.city ? ` · ${r.call.city}` : ''}
          {r.owner === 'Caller' ? ' · caller will do this' : ''}
        </a>
      </div>
      {r.dueDate && <span className="text-xs text-slate-500 shrink-0">{shortDate(r.dueDate)}</span>}
    </li>
  );

  return (
    <>
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          {(['Company', 'all'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWhose(w)}
              className={`px-3 h-8 rounded-lg text-xs font-medium ${whose === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {w === 'Company' ? 'Our tasks' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {groups.openCount === 0 && groups.done.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title="No follow-ups yet" />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.groups
            .filter((g) => g.rows.length)
            .map((g) => (
              <section key={g.title}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${g.tone}`}>
                  {g.title} · {g.rows.length}
                </h2>
                <Card>
                  <ul className="divide-y divide-slate-100">
                    {g.rows.map((r) => (
                      <Item key={r.id} r={r} />
                    ))}
                  </ul>
                </Card>
              </section>
            ))}
          {groups.openCount === 0 && <Card className="p-5 text-sm text-slate-500">All caught up. No open tasks.</Card>}
          {groups.done.length > 0 && (
            <section>
              <button onClick={() => setShowDone(!showDone)} className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-700 mb-2">
                {showDone ? 'Hide' : 'Show'} completed · {groups.done.length}
              </button>
              {showDone && (
                <Card>
                  <ul className="divide-y divide-slate-100">
                    {groups.done.map((r) => (
                      <Item key={r.id} r={r} />
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
};
