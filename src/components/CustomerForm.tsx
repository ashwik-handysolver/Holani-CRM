import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, MapPin, Phone, User, X } from 'lucide-react';
import { CallerType, Customer } from '../types';
import { useStore } from '../store';
import { uid } from '../lib/format';
import { Button } from './ui';

const TYPES: CallerType[] = ['Dealer', 'Distributor', 'Retailer', 'End Customer', 'Supplier', 'Other'];
const digits = (s: string) => s.replace(/\D/g, '').slice(-10);

const Field: React.FC<{ label: string; icon: React.ElementType; error?: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, icon: Icon, error, hint, children }) => (
  <label className="block">
    <span className="text-xs font-medium text-slate-600">{label}</span>
    <div
      className={`mt-1.5 flex items-center h-10 rounded-xl border bg-white transition focus-within:ring-4 ${
        error ? 'border-rose-400 focus-within:ring-rose-400/15' : 'border-slate-200 focus-within:border-amber-400 focus-within:ring-amber-400/15'
      }`}
    >
      <Icon className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
      {children}
    </div>
    {error ? <span className="block mt-1 text-xs text-rose-600">{error}</span> : hint && <span className="block mt-1 text-xs text-slate-500">{hint}</span>}
  </label>
);

const inputCls = 'flex-1 min-w-0 h-full px-2.5 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 !shadow-none';

/** Pop-up form to create or edit a customer. `prefill` starts a new customer with suggested values. */
export const CustomerForm: React.FC<{
  initial?: Customer;
  prefill?: Partial<Customer>;
  title?: string;
  subtitle?: string;
  notice?: React.ReactNode;
  submitLabel?: string;
  onSaved: (c: Customer) => void;
  onCancel: () => void;
}> = ({ initial, prefill, title, subtitle, notice, submitLabel, onSaved, onCancel }) => {
  const { customers, saveCustomer } = useStore();
  const [f, setF] = useState({
    name: initial?.name || prefill?.name || '',
    company: initial?.company || prefill?.company || '',
    phone: initial?.phone || prefill?.phone || '',
    city: initial?.city || prefill?.city || '',
    type: initial?.type || prefill?.type || ('Dealer' as CallerType),
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    // Ignore Esc while a confirmation is open on top; that Esc belongs to the confirmation.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=alertdialog]') && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const phone = digits(f.phone);
  const nameErr = tried && !f.name.trim() ? 'Enter the customer’s name' : undefined;
  const phoneErr = tried && f.phone.trim() && phone.length !== 10 ? 'Enter a 10-digit mobile number' : undefined;
  const dupe = phone.length === 10 ? customers.find((c) => c.id !== initial?.id && c.phone && digits(c.phone) === phone) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!f.name.trim() || (f.phone.trim() && phone.length !== 10)) return;
    const c: Customer = {
      id: initial?.id || uid(),
      createdAt: initial?.createdAt || new Date().toISOString(),
      name: f.name.trim(),
      company: f.company.trim() || null,
      phone: phone || null,
      city: f.city.trim() || null,
      type: f.type,
    };
    saveCustomer(c);
    onSaved(c);
  };

  // Rendered at the top of the page so nothing (like the sticky header) can sit above it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-form-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <form onSubmit={submit} noValidate className="relative w-full sm:max-w-lg bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl view-enter">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 id="customer-form-title" className="text-base font-semibold text-slate-900">
              {title || (initial ? 'Edit customer' : 'New customer')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle || (initial ? 'Update their details.' : 'You can upload their call recordings next.')}</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {notice}
          <Field label="Name" icon={User} error={nameErr}>
            <input autoFocus value={f.name} onChange={set('name')} className={inputCls} placeholder="e.g. Ramesh Kumar" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Mobile number"
              icon={Phone}
              error={phoneErr}
              hint={dupe && <>Already saved as <a href={`#/customers/${dupe.id}`} className="font-medium text-amber-600 underline">{dupe.name}</a></>}
            >
              <span className="text-sm text-slate-400 pl-2">+91</span>
              <input value={f.phone} onChange={set('phone')} className={inputCls} placeholder="98765 43210" inputMode="tel" />
            </Field>
            <Field label="City" icon={MapPin}>
              <input value={f.city} onChange={set('city')} className={inputCls} placeholder="e.g. Pune" />
            </Field>
          </div>
          <Field label="Company" icon={Building2}>
            <input value={f.company} onChange={set('company')} className={inputCls} placeholder="Optional" />
          </Field>
          <div>
            <span className="text-xs font-medium text-slate-600">Customer type</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setF({ ...f, type: t })}
                  aria-pressed={f.type === t}
                  className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                    f.type === t ? 'bg-amber-400 border-amber-400 text-slate-950' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {submitLabel || (initial ? 'Save changes' : 'Create customer')}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};
