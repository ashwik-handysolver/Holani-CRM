import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from './ui';

// In-app replacements for window.confirm / window.alert.
// Usage: if (await confirmDialog({ title: 'Delete?', message: '…', danger: true })) { … }

interface Options {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for actions that delete something. */
  danger?: boolean;
}
interface Request extends Options {
  kind: 'confirm' | 'alert';
  resolve: (ok: boolean) => void;
}

let show: ((r: Request) => void) | null = null;

const open = (kind: Request['kind'], opts: Options) =>
  new Promise<boolean>((resolve) => {
    if (!show) return resolve(kind === 'alert'); // host not mounted yet
    show({ ...opts, kind, resolve });
  });

/** Ask a yes/no question. Resolves true if the user confirms. */
export const confirmDialog = (opts: Options) => open('confirm', opts);
/** Show a message with a single OK button. */
export const alertDialog = (opts: Options) => open('alert', opts).then(() => undefined);

/** Render once near the root of the app. */
export const DialogHost: React.FC = () => {
  const [req, setReq] = useState<Request | null>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    // Focus the safe choice for destructive actions, otherwise the main button.
    (req.danger && req.kind === 'confirm' ? cancelBtn : okBtn).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const Icon = req.danger ? AlertTriangle : Info;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => close(false)} />
      <div className="relative w-full sm:max-w-sm bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl view-enter">
        <div className="flex gap-3 p-5">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${req.danger ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id="dialog-title" className="text-sm font-semibold text-slate-900">
              {req.title}
            </h2>
            {req.message && (
              <div id="dialog-message" className="text-sm text-slate-500 mt-1 leading-relaxed">
                {req.message}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          {req.kind === 'confirm' && (
            <Button ref={cancelBtn} variant="ghost" onClick={() => close(false)}>
              {req.cancelLabel || 'Cancel'}
            </Button>
          )}
          <Button
            ref={okBtn}
            variant="primary"
            onClick={() => close(true)}
            className={req.danger ? '!bg-rose-600 hover:!bg-rose-700 !text-white [&_svg]:!text-white' : ''}
          >
            {req.confirmLabel || (req.kind === 'alert' ? 'OK' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
};
