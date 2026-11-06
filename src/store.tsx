import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Call, CallAnalysis, Customer, DriveRef, QueueItem, UploadOptions } from './types';
import { db } from './lib/db';
import { uid } from './lib/format';

// Recordings are analysed strictly one after another: the next starts only when the previous
// one has finished (or failed). Uploading many at once just makes a longer queue.
const CONCURRENCY = 1;

interface Store {
  calls: Call[];
  loaded: boolean;
  queue: QueueItem[];
  /** Add recordings (files from this device, or Google Drive files) to the analysis queue; returns their queue ids. */
  enqueue: (sources: Array<File | DriveRef>, opts?: UploadOptions) => string[];
  retry: (id: string) => void;
  dismiss: (id: string) => void;
  /** Stop analysing a recording (running or waiting) and drop it. */
  cancel: (id: string) => void;
  /** Delete a customer and all their calls and recordings. */
  deleteCustomer: (id: string) => void;
  /** Link a call that was waiting for a new customer to be confirmed. */
  assignCustomer: (callId: string, customer: Customer) => void;
  updateCall: (call: Call) => void;
  deleteCall: (id: string) => void;
  customers: Customer[];
  saveCustomer: (c: Customer) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

export const readBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const readDuration = (file: File) =>
  new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? a.duration : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });

export const guessMime = (f: File) => {
  if (f.type) return f.type;
  const ext = f.name.split('.').pop()?.toLowerCase();
  return ({ mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', amr: 'audio/amr', opus: 'audio/ogg', webm: 'audio/webm' } as Record<string, string>)[ext || ''] || 'audio/mpeg';
};

type Analysis = CallAnalysis & { actionItems: { task: string; owner: 'Company' | 'Caller'; dueDate: string | null }[] };

async function postJson(url: string, body: object, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  // The page updates by itself but the server only loads new code when restarted; say so plainly.
  if (res.status === 404 && json.error === 'Not found') {
    throw new Error('The server is running an older version. Restart it (Ctrl + C, then npm run dev) and retry.');
  }
  if (!res.ok) throw Object.assign(new Error(json.error || `Server error (${res.status})`), { reason: json.reason });
  return json;
}

/** Analyse a recording kept in the browser (sent to the server as part of the request). */
async function analyseFile(file: File, opts: UploadOptions = {}, customer?: Customer, signal?: AbortSignal): Promise<Call> {
  // A call is dated when it is uploaded. The file's "last modified" date is unreliable
  // (copied or re-saved recordings carry an old date) and made calls land on the wrong day.
  const callDate = new Date().toISOString();
  const [audioBase64, durationSec] = await Promise.all([readBase64(file), readDuration(file)]);
  const json = await postJson(
    '/api/analyze-call',
    { audioBase64, mimeType: guessMime(file), fileName: file.name, callDate: callDate.slice(0, 10), languageCode: opts.languageCode },
    signal,
  );
  return toCall(json.data, { fileName: file.name, fileSize: file.size, durationSec, callDate }, customer);
}

/** Analyse a recording that lives in Google Drive; the server fetches it from Drive itself. */
async function analyseDrive(ref: DriveRef, opts: UploadOptions = {}, customer?: Customer, signal?: AbortSignal): Promise<Call> {
  const callDate = new Date().toISOString();
  const json = await postJson('/api/analyze-drive', { fileId: ref.id, fileName: ref.name, callDate: callDate.slice(0, 10), languageCode: opts.languageCode }, signal);
  const a = json.data as Analysis;
  // Length isn't known without downloading the audio; the last transcript line is a close estimate.
  const last = a.transcript?.[a.transcript.length - 1]?.timestamp;
  const durationSec = last ? last.split(':').reduce((n, p) => n * 60 + (Number(p) || 0), 0) || null : null;
  return { ...toCall(a, { fileName: ref.name, fileSize: ref.size ?? 0, durationSec, callDate }, customer), driveFileId: ref.id };
}


function toCall(
  a: Analysis,
  meta: { fileName: string; fileSize: number; durationSec: number | null; callDate: string },
  customer?: Customer,
): Call {
  const { fileName, fileSize, durationSec, callDate } = meta;
  return {
    // The customer profile is the source of truth; the AI only fills gaps.
    callerName: customer?.name ?? a.callerName ?? null,
    companyName: customer?.company ?? a.companyName ?? null,
    city: customer?.city ?? a.city ?? null,
    phone: customer?.phone ?? a.phone ?? null,
    callerType: customer?.type || a.callerType || 'Other',
    customerId: customer?.id,
    category: a.category || 'Other',
    language: a.language || '—',
    summary: a.summary || '',
    keyPoints: a.keyPoints || [],
    products: a.products || [],
    orderValue: a.orderValue ?? null,
    sentiment: a.sentiment || 'Neutral',
    priority: a.priority || 'Medium',
    leadQuality: a.leadQuality || 'Not a lead',
    complaint: a.complaint ?? null,
    transcript: a.transcript || [],
    actionItems: (a.actionItems || []).map((t) => ({ ...t, id: uid(), dueDate: t.dueDate ?? null, done: false })),
    id: uid(),
    fileName,
    fileSize,
    durationSec,
    callDate,
    createdAt: new Date().toISOString(),
    notes: '',
    reviewed: false,
  };
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const customersRef = useRef<Customer[]>([]);
  customersRef.current = customers;
  const hints = useRef<Record<string, UploadOptions | undefined>>({});
  const running = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    Promise.all([
      db.calls.all().then((all) => {
        // Older calls were dated from the file; re-date them to their upload time once.
        all.forEach((c) => {
          if (c.createdAt && c.callDate !== c.createdAt) {
            c.callDate = c.createdAt;
            db.calls.put(c);
          }
        });
        setCalls(all.sort((a, b) => b.callDate.localeCompare(a.callDate)));
      }),
      db.customers.all().then((all) => setCustomers(all.sort((a, b) => a.name.localeCompare(b.name)))),
    ]).finally(() => setLoaded(true));
  }, []);

  const saveCall = useCallback((call: Call) => {
    setCalls((prev) => [call, ...prev.filter((c) => c.id !== call.id)].sort((a, b) => b.callDate.localeCompare(a.callDate)));
    db.calls.put(call);
  }, []);

  // Save a finished call and keep its audio so the recording can be played back later.
  const keepCall = useCallback(
    (call: Call, file: File) => {
      saveCall(call);
      db.audio.put({ id: call.id, blob: file }).catch((e) => console.warn('Could not save audio', e));
    },
    [saveCall],
  );

  // Process the queue, CONCURRENCY at a time.
  useEffect(() => {
    const waiting = queue.filter((q) => q.status === 'queued');
    const slots = CONCURRENCY - running.current.size;
    waiting.slice(0, Math.max(0, slots)).forEach((item) => {
      running.current.add(item.id);
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'processing', error: undefined } : x)));
      const opts = hints.current[item.id];
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      const customer = customersRef.current.find((c) => c.id === opts?.customerId);

      // Where recordings live:
      // - Google Drive recordings stay in Drive; the server fetches them for analysis and the player streams them.
      // - Manual uploads are kept in this browser's storage.
      //   TODO(supabase): upload manual recordings to the Supabase storage bucket instead, and save its path on the call.
      const ref = item.drive;
      (ref ? analyseDrive(ref, opts, customer, controller.signal) : analyseFile(item.file!, opts, customer, controller.signal))
        .then((call) => {
          if (controller.signal.aborted) return;
          // A "new customer" call is saved straight away (so a page refresh can't lose it)
          // and marked until the user confirms the customer's details.
          const final = opts?.newCustomer ? { ...call, needsCustomer: true } : call;
          if (ref) saveCall(final); // audio stays in Drive; only the analysis is stored here
          else keepCall(final, item.file!); // analysis + the recording itself, in browser storage
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'done', callId: call.id } : x)));
        })
        .catch((err) => {
          if (controller.signal.aborted) return; // cancelled by the user: already removed from the queue
          setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: 'error', error: err.message } : x)));
        })
        .finally(() => {
          running.current.delete(item.id);
          controllers.current.delete(item.id);
          setQueue((q) => [...q]);
        });
    });
  }, [queue, keepCall, saveCall]);

  const value: Store = {
    calls,
    loaded,
    queue,
    enqueue: (sources, opts) => {
      const items: QueueItem[] = sources.map((s) => ({
        id: uid(),
        ...(s instanceof File ? { file: s, name: s.name, size: s.size } : { drive: s, name: s.name, size: s.size }),
        status: 'queued' as const,
        customerId: opts?.customerId,
        newCustomer: opts?.newCustomer,
      }));
      items.forEach((i) => (hints.current[i.id] = opts));
      setQueue((q) => [...q, ...items]);
      return items.map((i) => i.id);
    },
    retry: (id) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: 'queued' } : x))),
    dismiss: (id) => setQueue((q) => q.filter((x) => x.id !== id)),
    cancel: (id) => {
      // Stops a running analysis (the server stops too) or takes a waiting one out of the line.
      controllers.current.get(id)?.abort();
      setQueue((q) => q.filter((x) => x.id !== id));
    },
    assignCustomer: (callId, customer) => {
      const c = calls.find((x) => x.id === callId);
      if (!c) return;
      // The confirmed customer profile is the source of truth for the caller's details.
      saveCall({
        ...c,
        needsCustomer: false,
        customerId: customer.id,
        callerName: customer.name,
        companyName: customer.company ?? c.companyName,
        city: customer.city ?? c.city,
        phone: customer.phone ?? c.phone,
        callerType: customer.type,
      });
    },
    updateCall: saveCall,
    deleteCall: (id) => {
      setCalls((prev) => prev.filter((c) => c.id !== id));
      db.calls.remove(id);
      db.audio.remove(id).catch(() => {});
    },
    customers,
    deleteCustomer: (id) => {
      const theirs = calls.filter((c) => c.customerId === id).map((c) => c.id);
      setCalls((prev) => prev.filter((c) => c.customerId !== id));
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      theirs.forEach((callId) => {
        db.calls.remove(callId);
        db.audio.remove(callId).catch(() => {});
      });
      db.customers.remove(id);
    },
    saveCustomer: (c) => {
      setCustomers((prev) => [c, ...prev.filter((x) => x.id !== c.id)].sort((a, b) => a.name.localeCompare(b.name)));
      db.customers.put(c);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
