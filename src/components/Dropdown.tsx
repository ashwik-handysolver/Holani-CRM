import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Small coloured dot before the label (e.g. priority colours). */
  dot?: string;
  icon?: React.ElementType;
  hint?: string;
}

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name; also shown as a small prefix on the button when `showLabel` is set. */
  label: string;
  showLabel?: boolean;
  /** Tint the button when a non-default value is chosen (for filters). Pass the "no filter" value. */
  defaultValue?: T;
  icon?: React.ElementType;
  className?: string;
  /** Show a search box (defaults to on for long lists). */
  searchable?: boolean;
}

const MENU_MAX_H = 288;

/** Styled replacement for <select>: floating menu, check mark, keyboard and type-to-search support. */
export function Dropdown<T extends string>({ value, options, onChange, label, showLabel, defaultValue, icon: Icon, className = '', searchable }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value);
  const filtering = defaultValue !== undefined && value !== defaultValue;
  const withSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);

  // Position the menu under (or above, if there's no room) the button. Rendered in a portal so cards and pop-ups can't clip it.
  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(MENU_MAX_H, 60 + options.length * 36) && r.top > below;
    setPos({ left: Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8), top: up ? r.top - 6 : r.bottom + 6, width: Math.max(r.width, 200), up });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
    const onScroll = (e: Event) => !menu.current?.contains(e.target as Node) && place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return setQ('');
    if (withSearch) setTimeout(() => search.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, withSearch]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (o: DropdownOption<T>) => {
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep Esc/Enter here so pop-ups behind the dropdown don't react to them.
    if (['Escape', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.stopPropagation();
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === 'Enter' || (e.key === ' ' && !withSearch)) {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (!withSearch && e.key.length === 1) {
      // Type a letter to jump to the next option starting with it.
      const i = shown.findIndex((o, n) => n > active && o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      const j = i >= 0 ? i : shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (j >= 0) setActive(j);
    }
  };

  const LeadIcon = current?.icon || Icon;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? ''}`}
        className={`group inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border text-sm transition-colors ${
          filtering
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400'
            : open
              ? 'border-amber-400 bg-white text-slate-900 ring-4 ring-amber-400/15'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
        } ${className}`}
      >
        {current?.dot ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: current.dot }} /> : LeadIcon && <LeadIcon className="w-4 h-4 shrink-0 text-slate-400" />}
        {showLabel && <span className="text-slate-400 shrink-0">{label}:</span>}
        <span className="truncate flex-1 text-left font-medium">{current?.label ?? 'Select…'}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            onKeyDown={onKeyDown}
            className="dropdown-in fixed z-[80] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
            style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            {withSearch && (
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={search}
                    value={q}
                    onChange={(e) => (setQ(e.target.value), setActive(0))}
                    placeholder="Search…"
                    aria-label={`Search ${label}`}
                    className="w-full h-8 pl-8 pr-2 rounded-md bg-slate-50 border border-transparent text-sm text-slate-900 focus:border-amber-400 !shadow-none"
                  />
                </div>
              </div>
            )}
            <ul id={listId} role="listbox" aria-label={label} className="py-1 overflow-y-auto" style={{ maxHeight: MENU_MAX_H - (withSearch ? 50 : 0) }}>
              {shown.map((o, i) => {
                const selected = o.value === value;
                const OIcon = o.icon;
                return (
                  <li
                    key={o.value}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`mx-1 flex items-center gap-2.5 px-2.5 h-9 rounded-md text-sm cursor-pointer ${
                      i === active ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                    } ${selected ? 'font-semibold' : ''}`}
                  >
                    {o.dot ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.dot }} /> : OIcon ? <OIcon className="w-4 h-4 text-slate-400 shrink-0" /> : null}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-slate-400">{o.hint}</span>}
                    {selected && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
