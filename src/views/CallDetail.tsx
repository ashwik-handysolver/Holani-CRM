import React, { useMemo, useState } from 'react';
import {
  Trash2, CheckCircle2, Circle, Package, ListChecks, MessageSquareText, Sparkles, AlertTriangle,
  Search, Copy, Pencil, Check, Plus, Languages, UserRound, ArrowLeft,
} from 'lucide-react';
import { useStore } from '../store';
import { Call } from '../types';
import { Badge, Button, Card, EmptyState, categoryTone, leadTone, priorityTone, sentimentTone } from '../components/ui';
import { AudioPlayer } from '../components/AudioPlayer';
import { confirmDialog } from '../components/Dialog';
import { ProductsEditor, SummaryEditor, TasksEditor } from '../components/CallEditors';
import { callerLabel, dateTime, duration, inr, uid } from '../lib/format';
import { navigate } from '../lib/router';

type Tab = 'summary' | 'transcript' | 'products' | 'tasks' | 'details';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-sm font-medium text-slate-900 mt-0.5 break-words">{children}</div>
  </div>
);

const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return <>{parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="bg-amber-200 rounded px-0.5">{p}</mark> : p))}</>;
};

/** Card title row with an Edit button. */
const SectionBar: React.FC<{ title: string; onEdit: () => void }> = ({ title, onEdit }) => (
  <div className="flex items-center justify-between px-5 pt-4 pb-3">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <Button variant="ghost" icon={Pencil} onClick={onEdit} className="!px-2.5 !py-1.5 text-xs">
      Edit
    </Button>
  </div>
);

const toSeconds =(ts: string) => ts.split(':').reduce((n, part) => n * 60 + (Number(part) || 0), 0);

const EditDetails: React.FC<{ call: Call; onSave: (c: Call) => void; onCancel: () => void }> = ({ call, onSave, onCancel }) => {
  const [f, setF] = useState({ callerName: call.callerName || '', companyName: call.companyName || '', city: call.city || '', phone: call.phone || '' });
  const input = (k: keyof typeof f, label: string) => (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400" />
    </label>
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {input('callerName', 'Caller name')}
      {input('companyName', 'Company / shop')}
      {input('city', 'City')}
      {input('phone', 'Phone')}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          icon={Check}
          onClick={() => onSave({ ...call, callerName: f.callerName || null, companyName: f.companyName || null, city: f.city || null, phone: f.phone || null })}
        >
          Save
        </Button>
      </div>
    </div>
  );
};

export const CallDetail: React.FC<{ id: string }> = ({ id }) => {
  const { calls, customers, loaded, updateCall, deleteCall } = useStore();
  const call = calls.find((c) => c.id === id);
  const [tab, setTab] = useState<Tab>('summary');
  const [editing, setEditing] = useState(false);
  const [tq, setTq] = useState('');
  const [english, setEnglish] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [editTab, setEditTab] = useState<Tab | null>(null);
  const [copied, setCopied] = useState(false);

  const lines = useMemo(
    () => (call?.transcript || []).filter((l) => !tq || (l.text + ' ' + (l.english || '')).toLowerCase().includes(tq.toLowerCase())),
    [call, tq],
  );

  if (!loaded) return null;
  if (!call) {
    return (
      <Card>
        <EmptyState icon={MessageSquareText} title="Call not found" action={<Button onClick={() => navigate('calls')}>Back to calls</Button>} />
      </Card>
    );
  }

  const save = (patch: Partial<Call>) => updateCall({ ...call, ...patch });
  const hasEnglish = call.transcript.some((l) => l.english);
  const isCompany = (s: string) => /company|staff|agent|sales|rep/i.test(s);
  const openTasks = call.actionItems.filter((a) => !a.done).length;
  const customer = call.customerId ? customers.find((c) => c.id === call.customerId) : null;

  const TABS: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'summary', label: 'Summary', icon: Sparkles },
    { id: 'transcript', label: 'Transcript', icon: MessageSquareText, count: call.transcript.length },
    { id: 'products', label: 'Products', icon: Package, count: call.products.length },
    { id: 'tasks', label: 'Follow-ups', icon: ListChecks, count: openTasks },
    { id: 'details', label: 'Details & notes', icon: UserRound },
  ];

  return (
    <>
      <button onClick={() => (history.length > 1 ? history.back() : navigate('calls'))} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Header */}
      <Card className="p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 break-words">{callerLabel(call)}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {[call.companyName !== callerLabel(call) && call.companyName, call.city, dateTime(call.callDate), duration(call.durationSec), call.language].filter(Boolean).join(' · ')}
            </p>
            {customer && (
              <a href={`#/customers/${customer.id}`} className="inline-block mt-1 text-xs font-medium text-amber-600 hover:underline">
                View {customer.name}’s profile
              </a>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge tone={categoryTone(call.category)}>{call.category}</Badge>
              <Badge tone={priorityTone(call.priority)} dot>{call.priority} priority</Badge>
              <Badge tone={leadTone(call.leadQuality)}>{call.leadQuality === 'Not a lead' ? 'Not a lead' : `${call.leadQuality} lead`}</Badge>
              <Badge tone={sentimentTone(call.sentiment)}>{call.sentiment}</Badge>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant={call.reviewed ? 'secondary' : 'primary'} icon={call.reviewed ? CheckCircle2 : Check} onClick={() => save({ reviewed: !call.reviewed })}>
              {call.reviewed ? 'Reviewed' : 'Mark reviewed'}
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              aria-label="Delete call"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Delete this call?',
                  message: 'Its transcript, summary, follow-ups and recording will be deleted. This can’t be undone.',
                  confirmLabel: 'Delete call',
                  danger: true,
                });
                if (ok) {
                  deleteCall(call.id);
                  navigate(customer ? `customers/${customer.id}` : 'calls');
                }
              }}
            />
          </div>
        </div>
        <div className="mt-4">
          <AudioPlayer callId={call.id} driveFileId={call.driveFileId} fileName={call.fileName} />
        </div>
      </Card>

      {/* Tabs */}
      <div className="sticky top-[5.5rem] z-20 -mx-1 px-1 mb-4 overflow-x-auto">
        <div role="tablist" aria-label="Call analysis" className="inline-flex min-w-full sm:min-w-0 gap-1 rounded-xl border border-slate-200 bg-white/90 backdrop-blur p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setEditTab(null);
              }}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <t.icon className={`w-4 h-4 ${tab === t.id ? 'text-amber-400' : ''}`} />
              {t.label}
              {t.count ? <span className={`text-[11px] tabular-nums ${tab === t.id ? 'text-slate-300' : 'text-slate-400'}`}>{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="view-enter" key={tab}>
        {tab === 'summary' && (
          <div className="space-y-4">
            {call.complaint && (
              <Card className="border-rose-200 bg-rose-50">
                <div className="p-5 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-rose-700">
                      Complaint · {call.complaint.severity} severity{call.complaint.product ? ` · ${call.complaint.product}` : ''}
                    </div>
                    <p className="text-sm text-rose-700 mt-1">{call.complaint.issue}</p>
                  </div>
                </div>
              </Card>
            )}
            {editTab === 'summary' ? (
              <SummaryEditor
                summary={call.summary}
                keyPoints={call.keyPoints}
                onCancel={() => setEditTab(null)}
                onSave={(summary, keyPoints) => (save({ summary, keyPoints }), setEditTab(null))}
              />
            ) : (
              <Card>
                <SectionBar title="Summary" onEdit={() => setEditTab('summary')} />
                <div className="px-5 pb-5">
                  <p className="text-[15px] leading-relaxed text-slate-800">{call.summary || 'No summary.'}</p>
                  {call.keyPoints.length > 0 && (
                    <>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-5 mb-2">Key points</div>
                      <ul className="space-y-2">
                        {call.keyPoints.map((k, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                            {k}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </Card>
            )}
            <Card className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Order value">{inr(call.orderValue)}</Field>
              <Field label="Products">{call.products.length || '—'}</Field>
              <Field label="Open follow-ups">{openTasks}</Field>
              <Field label="Language">{call.language}</Field>
            </Card>
          </div>
        )}

        {tab === 'transcript' && (
          <Card>
            <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-slate-100">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={tq}
                  onChange={(e) => setTq(e.target.value)}
                  placeholder="Find in transcript"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400"
                />
              </div>
              <div className="flex gap-1">
                {hasEnglish && (
                  <Button variant={english ? 'secondary' : 'ghost'} icon={Languages} onClick={() => setEnglish(!english)}>
                    {english ? 'Original' : 'English'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  icon={copied ? Check : Copy}
                  onClick={() => {
                    navigator.clipboard.writeText(call.transcript.map((l) => `[${l.timestamp}] ${l.speaker}: ${english && l.english ? l.english : l.text}`).join('\n'));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              {lines.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">{call.transcript.length ? 'No lines match.' : 'No transcript.'}</p>}
              {lines.map((l, i) => {
                const mine = isCompany(l.speaker);
                return (
                  <div key={i} className="flex gap-3">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('callsense:seek', { detail: { callId: call.id, seconds: toSeconds(l.timestamp) } }))}
                      className="text-[11px] font-mono text-slate-400 hover:text-amber-600 w-11 shrink-0 pt-0.5 text-left"
                      title="Play from here"
                    >
                      {l.timestamp}
                    </button>
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold ${mine ? 'text-slate-500' : 'text-amber-700'}`}>{l.speaker}</div>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        <Highlight text={english && l.english ? l.english : l.text} q={tq} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {tab === 'products' && editTab === 'products' && (
          <ProductsEditor
            products={call.products}
            orderValue={call.orderValue}
            onCancel={() => setEditTab(null)}
            onSave={(products, orderValue) => (save({ products, orderValue }), setEditTab(null))}
          />
        )}
        {tab === 'products' && editTab !== 'products' && (
          <Card>
            <SectionBar title="Products discussed" onEdit={() => setEditTab('products')} />
            {call.products.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No products mentioned in this call.</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {call.products.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900">{p.name}</div>
                      {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
                    </div>
                    {p.quantity && <span className="text-sm text-slate-600 shrink-0">{p.quantity}</span>}
                  </li>
                ))}
              </ul>
            )}
            {call.orderValue ? (
              <div className="flex justify-between px-5 py-3 border-t border-slate-100 text-sm">
                <span className="text-slate-500">Order value discussed</span>
                <span className="font-semibold text-slate-900">{inr(call.orderValue)}</span>
              </div>
            ) : null}
          </Card>
        )}

        {tab === 'tasks' && editTab === 'tasks' && (
          <TasksEditor items={call.actionItems} onCancel={() => setEditTab(null)} onSave={(actionItems) => (save({ actionItems }), setEditTab(null))} />
        )}
        {tab === 'tasks' && editTab !== 'tasks' && (
          <Card>
            <SectionBar title="Follow-ups" onEdit={() => setEditTab('tasks')} />
            <ul className="px-2 pb-2">
              {call.actionItems.map((a) => (
                <li key={a.id} className="flex gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50">
                  <button
                    onClick={() => save({ actionItems: call.actionItems.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) })}
                    aria-label={a.done ? 'Mark not done' : 'Mark done'}
                    className="mt-0.5"
                  >
                    {a.done ? <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500" /> : <Circle className="w-[18px] h-[18px] text-slate-300 hover:text-slate-500" />}
                  </button>
                  <div className="min-w-0">
                    <div className={`text-sm ${a.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{a.task}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {a.owner === 'Company' ? 'Our team' : 'Caller'}
                      {a.dueDate && ` · due ${new Date(a.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </div>
                  </div>
                </li>
              ))}
              {call.actionItems.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">No follow-ups found in this call.</li>}
            </ul>
            <form
              className="flex gap-2 p-4 border-t border-slate-100"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                save({ actionItems: [...call.actionItems, { id: uid(), task: newTask.trim(), owner: 'Company', dueDate: null, done: false }] });
                setNewTask('');
              }}
            >
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Add a follow-up"
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400"
              />
              <Button type="submit" icon={Plus} aria-label="Add follow-up" />
            </form>
          </Card>
        )}

        {tab === 'details' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Caller details</h3>
                {!editing && (
                  <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                )}
              </div>
              {editing ? (
                <EditDetails call={call} onCancel={() => setEditing(false)} onSave={(c) => (updateCall(c), setEditing(false))} />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Name">{call.callerName || '—'}</Field>
                  <Field label="Company">{call.companyName || '—'}</Field>
                  <Field label="City">{call.city || '—'}</Field>
                  <Field label="Phone">{call.phone || '—'}</Field>
                  <Field label="Caller type">{call.callerType}</Field>
                  <Field label="Recording">
                    <span className="font-normal text-slate-600 break-all">{call.fileName}</span>
                  </Field>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Notes</h3>
              <textarea
                defaultValue={call.notes}
                onBlur={(e) => e.target.value !== call.notes && save({ notes: e.target.value })}
                rows={6}
                placeholder="Add your own notes about this call…"
                className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 resize-y focus:border-amber-400"
              />
            </Card>
          </div>
        )}
      </div>
    </>
  );
};
