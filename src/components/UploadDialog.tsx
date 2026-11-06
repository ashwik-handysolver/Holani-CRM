import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileAudio, Search, Sparkles, UploadCloud, UserPlus, Users, X } from 'lucide-react';
import { useStore } from '../store';
import { Customer, DriveRef } from '../types';
import { navigate } from '../lib/router';
import { fileSize } from '../lib/format';
import { Button } from './ui';
import { cancelAnalysis } from './UploadPanel';

const ACCEPT = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.amr,.opus,.webm';
const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|amr|opus|webm)$/i.test(f.name);

export interface UploadRequest {
  /** Suggest adding to this customer (e.g. the profile being viewed). */
  customerId?: string;
  /** A recording that's already chosen, e.g. one that arrived in Google Drive. */
  file?: File | DriveRef;
  /** Where the file came from, shown in the pop-up. */
  source?: string;
  /** Called once the user has chosen a customer for the file (not when they just close the pop-up). */
  onChosen?: () => void;
}

/** Open the upload pop-up from anywhere. */
export const openUpload = (req: UploadRequest = {}) => window.dispatchEvent(new CustomEvent('callsense:upload', { detail: req }));

/**
 * The one place recordings are uploaded:
 * 1. choose a recording, 2. create a new customer from it (details come from the call's analysis) or add it to an existing customer.
 */
export const UploadDialog: React.FC<{ suggestId?: string; initialFile?: File | DriveRef; source?: string; onChosen?: () => void; onClose: () => void }> = ({
  suggestId,
  initialFile,
  source,
  onChosen,
  onClose,
}) => {
  const { customers, enqueue, queue, cancel } = useStore();
  const [file, setFile] = useState<File | DriveRef | null>(initialFile || null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [mode, setMode] = useState<'pick' | 'new' | 'existing'>('pick');
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const suggested = suggestId ? customers.find((c) => c.id === suggestId) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && mode !== 'new' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mode]);

  const choose = (list: FileList | null) => {
    const f = Array.from(list || [])[0];
    if (!f) return;
    if (!isAudio(f)) return setError('That file isn’t an audio recording.');
    setError('');
    setFile(f);
  };

  const addTo = (c: Customer) => {
    if (!file) return;
    enqueue([file], { customerId: c.id });
    onChosen?.();
    onClose();
    navigate(`customers/${c.id}`);
  };

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers.filter((c) => !t || [c.name, c.company, c.phone, c.city].join(' ').toLowerCase().includes(t)).slice(0, 6);
  }, [customers, q]);

  // New customer: analyse in the background; the pre-filled form opens when it's ready.
  const startNew = () => {
    if (!file) return;
    setQueueId(enqueue([file], { newCustomer: true })[0]);
    onChosen?.();
    setMode('new');
  };

  const stopNew = async () => {
    const item = queue.find((x) => x.id === queueId);
    if (!item) return onClose(); // already finished
    if (await cancelAnalysis(item, cancel)) onClose();
  };

  if (mode === 'new') {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="upload-started">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full sm:max-w-sm bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 text-center view-enter">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-amber-500" />
          </div>
          <h2 id="upload-started" className="text-sm font-semibold text-slate-900">
            Analysing the call
          </h2>
          <p className="text-xs text-slate-500 mt-1.5">
            This takes 1–2 minutes. The new customer form will open by itself, already filled in from the call. You can keep working meanwhile.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="ghost" className="text-rose-600 hover:!bg-rose-50" onClick={stopNew}>
              Cancel analysis
            </Button>
            <Button variant="primary" onClick={onClose}>
              OK
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl view-enter">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 id="upload-title" className="text-base font-semibold text-slate-900">
              {source ? `New recording in ${source}` : 'Upload a recording'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{file ? 'Whose call is this?' : 'Choose a call recording to analyse.'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => (choose(e.target.files), (e.target.value = ''))} />

          {/* Step 1: the recording */}
          {!file ? (
            <div
              onDragOver={(e) => (e.preventDefault(), setDrag(true))}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                choose(e.dataTransfer.files);
              }}
              onClick={() => input.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 flex flex-col items-center text-center transition-colors ${
                drag ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6 text-amber-500" />
              </div>
              <div className="text-sm font-semibold text-slate-900">Drop a recording here</div>
              <div className="text-xs text-slate-500 mt-0.5">or click to browse · MP3, WAV, M4A, AAC, OGG, AMR</div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <FileAudio className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                <div className="text-xs text-slate-500">
                  {source ? `From ${source} · ` : ''}
                  {file.size ? fileSize(file.size) : ''}
                </div>
              </div>
              {!initialFile && (
                <button onClick={() => (setFile(null), setMode('pick'))} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  Change
                </button>
              )}
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}

          {/* Step 2: whose call */}
          {file && mode === 'pick' && (
            <>
              {suggested && (
                <button
                  onClick={() => addTo(suggested)}
                  className="w-full flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-sm font-semibold shrink-0">{suggested.name[0]?.toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">Add to {suggested.name}</div>
                    <div className="text-xs text-slate-600">The customer you’re viewing</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
                </button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={startNew}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
                    <UserPlus className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">New customer</div>
                  <div className="text-xs text-slate-500 flex items-start gap-1">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" /> Details filled in from the call’s analysis
                  </div>
                </button>
                <button
                  onClick={() => setMode('existing')}
                  disabled={customers.length === 0}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-4 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="text-sm font-semibold text-slate-900">Existing customer</div>
                  <div className="text-xs text-slate-500">{customers.length ? `Add it to one of ${customers.length} customers` : 'No customers yet'}</div>
                </button>
              </div>
            </>
          )}

          {file && mode === 'existing' && (
            <div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find a customer by name, company or phone"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400"
                />
              </div>
              <ul className="mt-2 max-h-64 overflow-auto -mx-2">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => addTo(c)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-slate-100">
                      <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xs font-semibold shrink-0">{c.name[0]?.toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                        <div className="text-xs text-slate-500 truncate">{[c.company, c.phone, c.city].filter(Boolean).join(' · ') || c.type}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  </li>
                ))}
                {matches.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">No match. Go back and create a new customer instead.</li>}
              </ul>
              <button onClick={() => setMode('pick')} className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-900">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
