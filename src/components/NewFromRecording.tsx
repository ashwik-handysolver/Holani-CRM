import React, { useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { Call, CallerType, Customer } from '../types';
import { navigate } from '../lib/router';
import { CustomerForm } from './CustomerForm';
import { Button } from './ui';
import { confirmDialog } from './Dialog';
import { toast } from './Toast';

const TYPES: CallerType[] = ['Dealer', 'Distributor', 'Retailer', 'End Customer', 'Supplier', 'Other'];
const digits = (s?: string | null) => (s || '').replace(/\D/g, '').slice(-10);

/**
 * Shown when a "new customer" recording has finished analysing.
 * The form is pre-filled from Sarvam's analysis; the user confirms it
 * (or picks a matching existing customer) and the call is saved to that profile.
 */
export const NewCustomerReview: React.FC<{ call: Call; onClose: () => void }> = ({ call, onClose }) => {
  const { customers, assignCustomer, deleteCall, queue, dismiss } = useStore();

  const prefill: Partial<Customer> = {
    name: call.callerName || '',
    company: call.companyName,
    phone: digits(call.phone).length === 10 ? digits(call.phone) : null,
    city: call.city,
    type: TYPES.includes(call.callerType) ? call.callerType : 'Other',
  };

  // An existing customer with the same phone, or the same name, is probably this caller.
  const match = useMemo(() => {
    const p = digits(prefill.phone);
    const name = prefill.name?.trim().toLowerCase();
    return (p && customers.find((c) => digits(c.phone) === p)) || (name && customers.find((c) => c.name.trim().toLowerCase() === name)) || null;
  }, [customers, prefill.phone, prefill.name]);

  const finish = (c: Customer) => {
    assignCustomer(call.id, c);
    onClose();
    navigate(`customers/${c.id}`);
  };

  // Cancelling throws away the whole procedure: the analysed call and its recording.
  const cancelAll = async () => {
    const ok = await confirmDialog({
      title: 'Cancel creating this customer?',
      message: `The analysis of “${call.fileName}” and its recording will be discarded. This can’t be undone.`,
      confirmLabel: 'Yes, cancel',
      cancelLabel: 'Go back',
      danger: true,
    });
    if (!ok) return;
    deleteCall(call.id);
    queue.filter((q) => q.callId === call.id).forEach((q) => dismiss(q.id));
    onClose();
    toast({ title: 'Cancelled', message: `${call.fileName} was discarded.` });
  };

  const notice = (
    <>
      <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>Filled in from the call’s analysis. Please check before saving.</span>
      </div>
      {match && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
          <div className="min-w-0 flex-1 text-xs text-slate-600">
            Looks like <span className="font-semibold text-slate-900">{match.name}</span>
            {match.company ? ` (${match.company})` : ''}, who is already saved.
          </div>
          <Button
            type="button"
            variant="secondary"
            className="!px-2.5 !py-1.5 text-xs shrink-0 whitespace-nowrap [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1"
            onClick={() => finish(match)}
          >
            Add to them <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </>
  );

  return (
    <CustomerForm
      prefill={prefill}
      title="New customer from recording"
      subtitle={call.fileName}
      notice={notice}
      submitLabel="Create customer"
      onCancel={cancelAll}
      onSaved={finish}
    />
  );
};
