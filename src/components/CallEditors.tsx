import React, { useState } from 'react';
import { Building2, Check, Plus, Trash2, UserRound } from 'lucide-react';
import { Product, ActionItem } from '../types';
import { uid } from '../lib/format';
import { Button, Card } from './ui';
import { Dropdown } from './Dropdown';

const input = 'w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:border-amber-400';
const label = 'text-xs font-medium text-slate-600';

const Footer: React.FC<{ onCancel: () => void; onSave: () => void }> = ({ onCancel, onSave }) => (
  <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
    <Button variant="ghost" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant="primary" icon={Check} onClick={onSave}>
      Save
    </Button>
  </div>
);

const RemoveButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label: l }) => (
  <button type="button" onClick={onClick} className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={l}>
    <Trash2 className="w-4 h-4" />
  </button>
);

const AddButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700">
    <Plus className="w-3.5 h-3.5" /> {children}
  </button>
);

/** Edit the summary and key points. */
export const SummaryEditor: React.FC<{ summary: string; keyPoints: string[]; onSave: (summary: string, keyPoints: string[]) => void; onCancel: () => void }> = ({
  summary,
  keyPoints,
  onSave,
  onCancel,
}) => {
  const [text, setText] = useState(summary);
  const [points, setPoints] = useState(keyPoints.length ? keyPoints : ['']);
  return (
    <Card>
      <div className="p-5 space-y-4">
        <label className="block">
          <span className={label}>Summary</span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="mt-1.5 w-full p-3 rounded-lg border border-slate-200 bg-white text-sm leading-relaxed text-slate-900 resize-y focus:border-amber-400"
          />
        </label>
        <div>
          <span className={label}>Key points</span>
          <div className="mt-1.5 space-y-2">
            {points.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={p}
                  onChange={(e) => setPoints(points.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder="A key point from the call"
                  className={input}
                />
                <RemoveButton onClick={() => setPoints(points.filter((_, j) => j !== i))} label="Remove key point" />
              </div>
            ))}
          </div>
          <div className="mt-2">
            <AddButton onClick={() => setPoints([...points, ''])}>Add key point</AddButton>
          </div>
        </div>
      </div>
      <Footer onCancel={onCancel} onSave={() => onSave(text.trim(), points.map((p) => p.trim()).filter(Boolean))} />
    </Card>
  );
};

/** Edit products discussed and the order value. */
export const ProductsEditor: React.FC<{ products: Product[]; orderValue: number | null; onSave: (products: Product[], orderValue: number | null) => void; onCancel: () => void }> = ({
  products,
  orderValue,
  onSave,
  onCancel,
}) => {
  const [rows, setRows] = useState<Product[]>(products.length ? products : [{ name: '', quantity: null, notes: null }]);
  const [value, setValue] = useState(orderValue != null ? String(orderValue) : '');
  const set = (i: number, patch: Partial<Product>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Card>
      <div className="p-5 space-y-3">
        <div className="hidden sm:grid grid-cols-[1fr_7rem_1fr_2.25rem] gap-2">
          <span className={label}>Product</span>
          <span className={label}>Quantity</span>
          <span className={label}>Notes</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_1fr_2.25rem] gap-2 pb-3 sm:pb-0 border-b sm:border-0 border-slate-100">
            <input autoFocus={i === 0} value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Product name" aria-label="Product name" className={input} />
            <input value={r.quantity || ''} onChange={(e) => set(i, { quantity: e.target.value || null })} placeholder="Qty" aria-label="Quantity" className={input} />
            <input value={r.notes || ''} onChange={(e) => set(i, { notes: e.target.value || null })} placeholder="Size, colour…" aria-label="Notes" className={input} />
            <RemoveButton onClick={() => setRows(rows.filter((_, j) => j !== i))} label="Remove product" />
          </div>
        ))}
        <AddButton onClick={() => setRows([...rows, { name: '', quantity: null, notes: null }])}>Add product</AddButton>
        <label className="block pt-3 border-t border-slate-100">
          <span className={label}>Order value (₹)</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder="Not mentioned"
            className={`${input} mt-1.5 sm:max-w-xs`}
          />
        </label>
      </div>
      <Footer
        onCancel={onCancel}
        onSave={() =>
          onSave(
            rows.map((r) => ({ ...r, name: r.name.trim(), quantity: r.quantity?.trim() || null, notes: r.notes?.trim() || null })).filter((r) => r.name),
            value ? Number(value) : null,
          )
        }
      />
    </Card>
  );
};

/** Edit follow-up tasks: wording, who does it, due date. */
export const TasksEditor: React.FC<{ items: ActionItem[]; onSave: (items: ActionItem[]) => void; onCancel: () => void }> = ({ items, onSave, onCancel }) => {
  const blank = (): ActionItem => ({ id: uid(), task: '', owner: 'Company', dueDate: null, done: false });
  const [rows, setRows] = useState<ActionItem[]>(items.length ? items : [blank()]);
  const set = (id: string, patch: Partial<ActionItem>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Card>
      <div className="p-5 space-y-3">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-1 sm:grid-cols-[1fr_8.5rem_9.5rem_2.25rem] gap-2 pb-3 sm:pb-0 border-b sm:border-0 border-slate-100">
            <input autoFocus={i === 0} value={r.task} onChange={(e) => set(r.id, { task: e.target.value })} placeholder="What needs to be done" aria-label="Follow-up" className={input} />
            <Dropdown
              label="Who does it"
              value={r.owner}
              onChange={(owner) => set(r.id, { owner })}
              className="w-full"
              options={[
                { value: 'Company', label: 'Our team', icon: Building2 },
                { value: 'Caller', label: 'Caller', icon: UserRound },
              ]}
            />
            <input type="date" value={r.dueDate || ''} onChange={(e) => set(r.id, { dueDate: e.target.value || null })} aria-label="Due date" className={input} />
            <RemoveButton onClick={() => setRows(rows.filter((x) => x.id !== r.id))} label="Remove follow-up" />
          </div>
        ))}
        <AddButton onClick={() => setRows([...rows, blank()])}>Add follow-up</AddButton>
      </div>
      <Footer onCancel={onCancel} onSave={() => onSave(rows.map((r) => ({ ...r, task: r.task.trim() })).filter((r) => r.task))} />
    </Card>
  );
};
