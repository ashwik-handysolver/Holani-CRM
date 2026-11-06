import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Package, PhoneCall, Search, User, X } from 'lucide-react';
import { useStore } from '../store';
import { callerLabel, relative } from '../lib/format';
import { navigate } from '../lib/router';
import { norm } from '../views/Products';

interface Hit {
  key: string;
  group: 'Customers' | 'Products' | 'Calls';
  label: string;
  sub: string;
  href: string;
}

const ICON = { Customers: User, Products: Package, Calls: PhoneCall };

/** Header search: shows quick matches while typing; Enter opens the selected one. */
export const GlobalSearch: React.FC = () => {
  const { calls, customers } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // "/" or Ctrl/Cmd+K focuses the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const has = (...v: (string | null | undefined)[]) => v.join(' ').toLowerCase().includes(t);

    const cust = customers
      .filter((c) => has(c.name, c.company, c.phone, c.city))
      .slice(0, 3)
      .map((c) => ({ key: 'c' + c.id, group: 'Customers' as const, label: c.name, sub: [c.company, c.city].filter(Boolean).join(' · ') || c.type, href: `#/customers/${c.id}` }));

    const prods = new Map<string, { name: string; n: number }>();
    calls.forEach((c) =>
      c.products.forEach((p) => {
        if (!p.name || !has(p.name)) return;
        const k = norm(p.name);
        prods.set(k, { name: prods.get(k)?.name || p.name.trim(), n: (prods.get(k)?.n || 0) + 1 });
      }),
    );
    const prod = [...prods.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((p) => ({ key: 'p' + p.name, group: 'Products' as const, label: p.name, sub: `${p.n} mention${p.n > 1 ? 's' : ''}`, href: `#/calls?q=${encodeURIComponent(p.name)}` }));

    const call = calls
      .filter((c) => has(c.callerName, c.companyName, c.phone, c.summary))
      .slice(0, 3)
      .map((c) => ({ key: 'k' + c.id, group: 'Calls' as const, label: callerLabel(c), sub: `${c.category} · ${relative(c.callDate)}`, href: `#/calls/${c.id}` }));

    return [...cust, ...prod, ...call];
  }, [q, calls, customers]);

  const go = (href: string) => {
    navigate(href);
    setOpen(false);
    setQ('');
    input.current?.blur();
  };
  const searchAll = () => q.trim() && go(`calls?q=${encodeURIComponent(q.trim())}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
    else if (e.key === 'Escape') (setOpen(false), input.current?.blur());
    else if (e.key === 'Enter') (e.preventDefault(), sel < hits.length ? go(hits[sel].href) : searchAll());
  };

  let lastGroup = '';
  return (
    <div ref={box} className="relative w-full">
      <div className="group flex items-center h-10 rounded-xl bg-slate-100 border border-transparent focus-within:bg-white focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-400/15 transition">
        <Search className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
        <input
          ref={input}
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true), setSel(0))}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search customers, products, calls"
          aria-label="Search"
          className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 !shadow-none"
        />
        {q ? (
          <button onClick={() => (setQ(''), input.current?.focus())} className="mr-2 p-1 rounded-md text-slate-400 hover:text-slate-700" aria-label="Clear search">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden xl:block mr-2.5 whitespace-nowrap px-1.5 py-0.5 rounded-md border border-slate-200 bg-white text-[10px] font-medium text-slate-400">Ctrl K</kbd>
        )}
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-12 z-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {hits.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No quick matches.</div>}
          <ul className="max-h-80 overflow-auto py-1">
            {hits.map((h, i) => {
              const Icon = ICON[h.group];
              const header = h.group !== lastGroup ? (lastGroup = h.group) : null;
              return (
                <React.Fragment key={h.key}>
                  {header && <li className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{header}</li>}
                  <li>
                    <button
                      onMouseEnter={() => setSel(i)}
                      onClick={() => go(h.href)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left ${sel === i ? 'bg-slate-100' : ''}`}
                    >
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-slate-900 truncate">{h.label}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[40%]">{h.sub}</span>
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          <button
            onMouseEnter={() => setSel(hits.length)}
            onClick={searchAll}
            className={`w-full flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 text-sm text-slate-600 ${sel === hits.length ? 'bg-slate-100' : ''}`}
          >
            <Search className="w-4 h-4" /> Search all calls for “{q.trim()}”
            <CornerDownLeft className="w-3.5 h-3.5 ml-auto text-slate-400" />
          </button>
        </div>
      )}
    </div>
  );
};
