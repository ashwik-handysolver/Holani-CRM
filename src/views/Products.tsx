import React, { useMemo, useState } from 'react';
import { ChevronDown, Package, Search } from 'lucide-react';
import { useStore } from '../store';
import { Call } from '../types';
import { Badge, Card, EmptyState, PageHeader } from '../components/ui';
import { callerLabel, relative } from '../lib/format';

interface ProductRow {
  key: string;
  name: string;
  calls: Call[];
  quantities: string[];
  complaints: number;
  orders: number;
}

// Same product said slightly differently ("PVC pipe", "pvc  pipes") groups together.
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/s\b/g, '').trim();

export const Products: React.FC = () => {
  const { calls } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const products = useMemo(() => {
    const map = new Map<string, ProductRow>();
    calls.forEach((c) => {
      const seen = new Set<string>();
      c.products.forEach((p) => {
        const name = p.name?.trim();
        if (!name) return;
        const k = norm(name);
        const row = map.get(k) || { key: k, name, calls: [], quantities: [], complaints: 0, orders: 0 };
        if (p.quantity) row.quantities.push(p.quantity);
        if (!seen.has(k)) {
          seen.add(k);
          row.calls.push(c);
          if (c.complaint?.product && norm(c.complaint.product) === k) row.complaints++;
          if (c.category === 'New Order') row.orders++;
        }
        map.set(k, row);
      });
    });
    return [...map.values()].sort((a, b) => b.calls.length - a.calls.length);
  }, [calls]);

  const rows = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Products & catalogue" />
      {products.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title="No products mentioned yet" text="Products named in calls will appear here." />
        </Card>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${products.length} products`}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:border-amber-400"
            />
          </div>
          <Card>
            <ul className="divide-y divide-slate-100">
              {rows.map((p) => {
                const isOpen = open === p.key;
                return (
                  <li key={p.key}>
                    <button onClick={() => setOpen(isOpen ? null : p.key)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                        <div className="text-xs text-slate-500">Last asked {relative(p.calls[0].callDate)}</div>
                      </div>
                      <div className="hidden sm:flex gap-1.5">
                        {p.orders > 0 && <Badge tone="green">{p.orders} order{p.orders > 1 ? 's' : ''}</Badge>}
                        {p.complaints > 0 && <Badge tone="red">{p.complaints} complaint{p.complaints > 1 ? 's' : ''}</Badge>}
                      </div>
                      <span className="text-sm text-slate-600 tabular-nums w-16 text-right">{p.calls.length} call{p.calls.length > 1 ? 's' : ''}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <ul className="bg-slate-50 border-t border-slate-100 px-5 py-2">
                        {p.calls.slice(0, 5).map((c) => (
                          <li key={c.id}>
                            <a href={`#/calls/${c.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-slate-900 text-slate-700">
                              <span className="truncate">{callerLabel(c)}</span>
                              <span className="text-xs text-slate-400 shrink-0">{relative(c.callDate)}</span>
                            </a>
                          </li>
                        ))}
                        {p.calls.length > 5 && (
                          <li>
                            <a href={`#/calls?q=${encodeURIComponent(p.name)}`} className="block py-2 text-xs font-medium text-slate-500 hover:text-slate-900">
                              See all {p.calls.length} calls
                            </a>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
              {rows.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No products match “{q}”.</li>}
            </ul>
          </Card>
        </>
      )}
    </>
  );
};
