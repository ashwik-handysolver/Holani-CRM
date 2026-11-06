import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronUp, MapPin, Pencil, Phone, Play, Users } from 'lucide-react';
import { useStore } from '../store';
import { Badge, Button, Card, CardHeader, EmptyState, categoryTone } from '../components/ui';
import { CustomerForm } from '../components/CustomerForm';
import { QueueList } from '../components/UploadPanel';
import { duration, inr, relative } from '../lib/format';
import { AudioPlayer } from '../components/AudioPlayer';

export const CustomerProfile: React.FC<{ id: string }> = ({ id }) => {
  const { customers, calls, queue, loaded } = useStore();
  const [editing, setEditing] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const c = customers.find((x) => x.id === id);

  if (!loaded) return null;
  if (!c) {
    return (
      <Card>
        <EmptyState icon={Users} title="Customer not found" action={<a href="#/customers" className="text-sm font-medium text-slate-700">Back to customers</a>} />
      </Card>
    );
  }

  const mine = calls.filter((x) => x.customerId === id);
  const value = mine.reduce((n, x) => n + (x.orderValue || 0), 0);
  const tasks = mine.reduce((n, x) => n + x.actionItems.filter((a) => !a.done && a.owner === 'Company').length, 0);

  return (
    <>
      <a href="#/customers" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </a>

      {editing && <CustomerForm initial={c} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      <Card className="p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-lg font-semibold shrink-0">
            {c.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-slate-900 break-words min-w-0">{c.name}</h1>
              <Badge>{c.type}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
              {c.company && <span className="break-words min-w-0">{c.company}</span>}
              {c.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> {c.phone}
                </span>
              )}
              {c.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {c.city}
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)} aria-label="Edit customer">
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 text-center">
          <div className="min-w-0">
            <div className="text-lg font-semibold tabular-nums text-slate-900">{mine.length}</div>
            <div className="text-xs text-slate-500">recordings</div>
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold tabular-nums text-slate-900 truncate">{value ? inr(value) : '—'}</div>
            <div className="text-xs text-slate-500">discussed</div>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold tabular-nums text-slate-900">{tasks}</div>
            <div className="text-xs text-slate-500">open tasks</div>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <QueueList items={queue.filter((q) => q.customerId === id)} />
        <Card>
          <CardHeader title="Call recordings" />
          {mine.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">No recordings yet. Use “Upload” at the top to add one.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {mine.map((x) => {
                const open = playing === x.id;
                return (
                  <li key={x.id} className={open ? 'bg-slate-50' : ''}>
                    <div className="flex items-center gap-3 pl-3 pr-5 py-2.5">
                      <button
                        onClick={() => setPlaying(open ? null : x.id)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          open ? 'bg-slate-900 text-amber-400' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                        }`}
                        aria-label={open ? 'Close player' : `Play recording from ${relative(x.callDate)}`}
                        aria-expanded={open}
                      >
                        {open ? <ChevronUp className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
                      </button>
                      <a href={`#/calls/${x.id}`} className="flex-1 min-w-0 flex items-center gap-3 group">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-900 truncate group-hover:underline">{x.summary || x.fileName}</div>
                          <div className="text-xs text-slate-400">
                            {relative(x.callDate)}
                            {x.durationSec ? ` · ${duration(x.durationSec)}` : ''}
                          </div>
                        </div>
                        <span className="hidden sm:inline-flex">
                          <Badge tone={categoryTone(x.category)}>{x.category}</Badge>
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                      </a>
                    </div>
                    {open && (
                      <div className="px-3 sm:pl-15 pr-3 sm:pr-5 pb-3">
                        <AudioPlayer callId={x.id} driveFileId={x.driveFileId} fileName={x.fileName} autoPlay compact />
                      </div>
                    )}
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
