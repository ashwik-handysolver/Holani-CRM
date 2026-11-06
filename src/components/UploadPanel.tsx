import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, FileAudio, Languages, Loader2, RotateCw, UploadCloud, X } from 'lucide-react';
import { useStore } from '../store';
import { QueueItem } from '../types';
import { Button, Card, CardHeader } from './ui';
import { Dropdown } from './Dropdown';
import { fileSize } from '../lib/format';
import { confirmDialog } from './Dialog';
import { toast } from './Toast';

export const LANGUAGES: [string, string][] = [
  ['hi-IN', 'Hindi'], ['bn-IN', 'Bengali'], ['mr-IN', 'Marathi'], ['gu-IN', 'Gujarati'], ['pa-IN', 'Punjabi'],
  ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['kn-IN', 'Kannada'], ['ml-IN', 'Malayalam'], ['od-IN', 'Odia'],
  ['as-IN', 'Assamese'], ['ur-IN', 'Urdu'], ['en-IN', 'English (Indian)'], ['ne-IN', 'Nepali'], ['mai-IN', 'Maithili'],
  ['kok-IN', 'Konkani'], ['sd-IN', 'Sindhi'], ['ks-IN', 'Kashmiri'], ['doi-IN', 'Dogri'], ['mni-IN', 'Manipuri'],
  ['brx-IN', 'Bodo'], ['sat-IN', 'Santali'], ['sa-IN', 'Sanskrit'],
];

const ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.amr,.opus,.webm';

/** Drop zone that uploads recordings into one customer's profile. */
export const Dropzone: React.FC<{ customerId: string; inputRef?: React.RefObject<HTMLInputElement | null> }> = ({ customerId, inputRef }) => {
  const { enqueue } = useStore();
  const [drag, setDrag] = useState(false);
  const [lang, setLang] = useState('');
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef || own;

  const add = (list: FileList | null) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|amr|opus|webm)$/i.test(f.name));
    if (files.length) enqueue(files, { languageCode: lang || undefined, customerId });
  };

  return (
    <Card className="p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center text-center px-6 py-8 ${
          drag ? 'border-amber-400 bg-amber-50' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <UploadCloud className="w-7 h-7 text-amber-500 mb-2" />
        <div className="text-sm font-semibold text-slate-900">Add a recording</div>
        <div className="text-xs text-slate-500 mt-0.5">Drop audio files here, or click to browse</div>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <label className="text-xs text-slate-500 shrink-0">Language</label>
        <Dropdown
          label="Language"
          icon={Languages}
          value={lang}
          onChange={setLang}
          className="flex-1"
          options={[{ value: '', label: 'Detect automatically' }, ...LANGUAGES.map(([code, name]) => ({ value: code, label: name }))]}
        />
      </div>
    </Card>
  );
};

/** Ask, then stop a recording's analysis (running) or take it out of the line (waiting). */
export async function cancelAnalysis(q: QueueItem, cancel: (id: string) => void): Promise<boolean> {
  const running = q.status === 'processing';
  const ok = await confirmDialog({
    title: running ? 'Stop analysing this recording?' : 'Remove this recording from the queue?',
    message: running
      ? `“${q.name}” will stop being analysed and won’t be saved. Any part already processed by Sarvam may still count toward your usage.`
      : `“${q.name}” hasn’t started yet. It will be removed and won’t be analysed.`,
    confirmLabel: running ? 'Stop analysis' : 'Remove',
    cancelLabel: 'Keep going',
    danger: true,
  });
  if (!ok) return false;
  cancel(q.id);
  toast({ title: running ? 'Analysis stopped' : 'Removed from the queue', message: q.name });
  return true;
}

/** Upload progress list. Pass items to show only some of the queue. */
export const QueueList: React.FC<{ items: QueueItem[]; names?: Record<string, string> }> = ({ items, names }) => {
  const { retry, dismiss, calls, cancel } = useStore();
  if (items.length === 0) return null;
  // Analysed "new customer" recordings still waiting for the customer to be confirmed.
  const waiting = new Set(calls.filter((c) => c.needsCustomer).map((c) => c.id));
  const needsReview = (q: QueueItem) => q.status === 'done' && !!q.callId && waiting.has(q.callId);
  const done = items.filter((q) => q.status === 'done' && !needsReview(q));
  return (
    <Card>
      <CardHeader
        title="Uploads"
        action={
          done.length > 0 && (
            <Button variant="ghost" onClick={() => done.forEach((q) => dismiss(q.id))}>
              Clear finished
            </Button>
          )
        }
      />
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((q) => (
          <li key={q.id} className="flex items-center gap-3 px-5 py-3">
            <FileAudio className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{q.name}</div>
              <div className={`text-xs ${q.status === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
                {names && q.customerId && names[q.customerId] ? `${names[q.customerId]} · ` : ''}
                {q.status === 'queued' && `Waiting · ${(q.size ? fileSize(q.size) : 'From Google Drive')}`}
                {q.status === 'processing' && 'Transcribing and analysing…'}
                {q.status === 'done' && (needsReview(q) ? 'Analysed · confirm the new customer' : 'Analysis ready')}
                {q.status === 'error' && q.error}
              </div>
            </div>
            {q.status === 'processing' && <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />}
            {q.status === 'queued' && <span className="w-2 h-2 rounded-full bg-slate-300" />}
            {(q.status === 'queued' || q.status === 'processing') && (
              <Button variant="ghost" className="!px-2.5 !py-1.5 text-xs text-rose-600 hover:!bg-rose-50" onClick={() => cancelAnalysis(q, cancel)}>
                Cancel
              </Button>
            )}
            {needsReview(q) && (
              <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => window.dispatchEvent(new CustomEvent('callsense:review', { detail: { id: q.callId } }))}>
                Confirm customer
              </Button>
            )}
            {q.status === 'done' && !needsReview(q) && (
              <a href={`#/calls/${q.callId}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-900 hover:text-amber-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Open <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
            {q.status === 'error' && (
              <>
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <Button variant="ghost" icon={RotateCw} onClick={() => retry(q.id)}>
                  Retry
                </Button>
                <button onClick={() => dismiss(q.id)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Remove">
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};
