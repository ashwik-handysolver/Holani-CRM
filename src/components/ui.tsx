import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Category, LeadQuality, Level, Sentiment } from '../types';

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</div>
);

export const CardHeader: React.FC<{ title: string; action?: React.ReactNode; icon?: React.ElementType }> = ({ title, action, icon: Icon }) => (
  <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      {title}
    </h3>
    {action}
  </div>
);

type Tone = 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'violet';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
};

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; dot?: boolean }> = ({ tone = 'slate', children, dot }) => (
  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${tones[tone]}`}>
    {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
    {children}
  </span>
);

export const sentimentTone = (s: Sentiment): Tone => (s === 'Positive' ? 'green' : s === 'Negative' ? 'red' : 'slate');
export const priorityTone = (p: Level): Tone => (p === 'High' ? 'red' : p === 'Medium' ? 'amber' : 'slate');
export const leadTone = (l: LeadQuality): Tone => (l === 'Hot' ? 'red' : l === 'Warm' ? 'amber' : l === 'Cold' ? 'blue' : 'slate');
export const categoryTone = (c: Category): Tone =>
  c === 'Complaint' || c === 'Service Request'
    ? 'red'
    : c === 'New Order'
      ? 'green'
      : c === 'Payment'
        ? 'violet'
        : c === 'Price Inquiry' || c === 'Product Inquiry' || c === 'Dealership Inquiry'
          ? 'blue'
          : 'slate';

/** Spot in the floating header where pages put their action buttons. */
export const HeaderActionsSlot = createContext<HTMLElement | null>(null);

/** Page action buttons, shown in the floating header next to the page title. */
export const PageHeader: React.FC<{ title?: string; actions?: React.ReactNode }> = ({ actions }) => {
  const slot = useContext(HeaderActionsSlot);
  return actions && slot ? createPortal(actions, slot) : null;
};

export const EmptyState: React.FC<{ icon: React.ElementType; title: string; text?: string; action?: React.ReactNode }> = ({ icon: Icon, title, text, action }) => (
  <div className="flex flex-col items-center text-center py-14 px-6">
    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-slate-400" />
    </div>
    <div className="text-sm font-semibold text-slate-900">{title}</div>
    {text && <p className="text-sm text-slate-500 mt-1 max-w-sm">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: React.ElementType; ref?: React.Ref<HTMLButtonElement> }
> = ({ variant = 'secondary', icon: Icon, className = '', children, ...rest }) => {
  const v = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'text-rose-600 hover:bg-rose-50',
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${v} ${className}`}
    >
      {Icon && <Icon className={`w-4 h-4 ${variant === 'primary' ? 'text-amber-400' : ''}`} />}
      {children != null && children !== false && <span>{children}</span>}
    </button>
  );
};

// Dropdowns: use <Dropdown> from ./Dropdown (styled menu instead of the browser's plain <select>).
