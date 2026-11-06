import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Info, AlertCircle, X } from 'lucide-react';

// Small notifications in the corner. Usage: toast({ title: 'Saved', message: '…', tone: 'success' })

type Tone = 'info' | 'success' | 'error' | 'document';
interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

let push: ((t: Toast) => void) | null = null;
let nextId = 1;

export const toast = (t: Omit<Toast, 'id' | 'tone'> & { tone?: Tone }) => push?.({ tone: 'info', ...t, id: nextId++ });

const ICON = { info: Info, success: CheckCircle2, error: AlertCircle, document: FileText };
const COLOR = { info: 'text-amber-500', success: 'text-emerald-500', error: 'text-rose-500', document: 'text-sky-500' };
const LIFETIME = 6000;

/** Render once near the root of the app. */
export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    push = (t) => {
      setItems((prev) => [...prev.slice(-3), t]); // keep at most 4 on screen
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), LIFETIME);
    };
    return () => {
      push = null;
    };
  }, []);

  const close = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="fixed z-[70] right-3 bottom-20 md:bottom-4 md:right-4 flex flex-col items-end gap-2 pointer-events-none" aria-live="polite" role="status">
      {items.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="toast-in pointer-events-auto w-80 max-w-[calc(100vw-1.5rem)] flex gap-3 rounded-xl border border-slate-200 bg-white shadow-xl p-3.5">
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${COLOR[t.tone]}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{t.title}</div>
              {t.message && <div className="text-xs text-slate-500 mt-0.5 break-words">{t.message}</div>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    close(t.id);
                  }}
                  className="mt-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => close(t.id)} className="self-start p-1 -m-1 rounded-md text-slate-400 hover:text-slate-700" aria-label="Dismiss notification">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
