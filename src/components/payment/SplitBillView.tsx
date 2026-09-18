import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Minus, Plus, AlertTriangle } from 'lucide-react';
import type { CartItem, CompletedPayment, PaymentMethod, SplitMethod } from '../../types';
import { useCheckoutStore } from '../../store/checkoutStore';
import {
  calculateCartItemPrice,
  calculatePersonAssignedSubtotal,
  generateOrderNumber,
  getAssignedQuantity,
  sumPersonPayments,
} from '../../utils/calculations';
import { CURRENCY } from '../../data/demoData';
import ManagerApprovalPrompt from '../auth/ManagerApprovalPrompt';
import PersonCard from './PersonCard';

const METHOD_TABS: { id: SplitMethod; label: string }[] = [
  { id: 'by-person', label: 'حسب الأشخاص' },
  { id: 'by-item', label: 'حسب الأصناف' },
  { id: 'manual', label: 'تقسيم يدوي' },
];

interface Props {
  items: CartItem[];
  total: number;
  onComplete: (payment: CompletedPayment) => void;
  onBack: () => void;
  submitting?: boolean;
}

export default function SplitBillView({ items, total, onComplete, onBack, submitting }: Props) {
  const { splitMethod, setSplitMethod, people, setPeopleCount, assignments, assignItem, setManualAmount, addPayment } =
    useCheckoutStore();
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [managerApprovedBy, setManagerApprovedBy] = useState<string | null>(null);
  const [showApprovalPrompt, setShowApprovalPrompt] = useState(false);

  useEffect(() => {
    if (people.length === 0) setPeopleCount(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activePersonId && people.length > 0) setActivePersonId(people[0].id);
  }, [people, activePersonId]);

  const isAssignmentMode = splitMethod === 'by-person' || splitMethod === 'by-item';

  const personAmounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const person of people) {
      map[person.id] = splitMethod === 'manual' ? person.manualAmount ?? 0 : calculatePersonAssignedSubtotal(person.id, items, assignments);
    }
    return map;
  }, [people, items, assignments, splitMethod]);

  const totalAssigned = Object.values(personAmounts).reduce((sum, v) => sum + v, 0);
  const unassignedAmount = total - totalAssigned;
  const isFullyAssigned = Math.abs(unassignedAmount) < 0.01;

  const totalPaid = people.reduce((sum, p) => sum + sumPersonPayments(p), 0);
  const grandRemaining = Math.max(0, total - totalPaid);

  const canComplete = !!managerApprovedBy || (isFullyAssigned && grandRemaining <= 0.01);

  function handlePay(personId: string, method: PaymentMethod, amount: number) {
    addPayment(personId, { method, amount });
  }

  function handleComplete() {
    const payment: CompletedPayment = {
      orderNumber: generateOrderNumber(),
      subtotal: total,
      discount: null,
      discountAmount: 0,
      total,
      amountPaid: totalPaid,
      changeDue: 0,
      primaryMethod: people[0]?.payments[0]?.method ?? 'cash',
      completedAt: new Date().toISOString(),
    };
    onComplete(payment);
  }

  return (
    <div className="flex flex-col gap-5">
      <button onClick={onBack} className="flex w-fit items-center gap-1.5 text-xs font-semibold text-pos-text-soft">
        <ArrowRight size={14} /> رجوع
      </button>

      <div className="rounded-2xl border border-pos-border bg-pos-surface p-4 text-center">
        <p className="text-xs text-pos-text-soft">إجمالي الفاتورة</p>
        <p className="text-2xl font-extrabold text-pos-navy-900">{total.toFixed(2)} {CURRENCY}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-pos-text">عدد الأشخاص</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPeopleCount(Math.max(1, people.length - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-pos-border bg-pos-surface text-pos-text shadow-sm"
          >
            <Minus size={15} />
          </button>
          <span className="w-8 text-center text-lg font-bold">{people.length}</span>
          <button
            onClick={() => setPeopleCount(people.length + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-pos-border bg-pos-surface text-pos-text shadow-sm"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="flex rounded-xl border border-pos-border bg-pos-surface p-1">
        {METHOD_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSplitMethod(tab.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
              splitMethod === tab.id ? 'bg-pos-accent text-white' : 'text-pos-text-soft'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isAssignmentMode && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePersonId(p.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                  activePersonId === p.id ? 'bg-pos-navy-900 text-white' : 'border border-pos-border bg-pos-surface text-pos-text-soft'
                }`}
              >
                {p.label} — {(personAmounts[p.id] ?? 0).toFixed(0)} {CURRENCY}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-pos-text-soft">دوّسي على "+" حتى تسندي صنف للشخص المختار فوق</p>

          <div className="space-y-2">
            {items.map((item) => {
              const { unitPrice } = calculateCartItemPrice(item);
              const assignedTotal = getAssignedQuantity(item.lineId, assignments);
              const remaining = item.quantity - assignedTotal;
              const activeAssigned = assignments.find((a) => a.lineId === item.lineId && a.personId === activePersonId)?.quantity ?? 0;

              return (
                <div key={item.lineId} className="flex items-center justify-between rounded-xl border border-pos-border bg-pos-surface p-3">
                  <div>
                    <p className="text-sm font-semibold text-pos-text">{item.product.name}</p>
                    <p className="text-[11px] text-pos-text-soft">
                      {unitPrice.toFixed(2)} {CURRENCY} — الكمية الكلية {item.quantity} {remaining > 0 && `(متبقي ${remaining} غير مُسند)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!activePersonId || activeAssigned <= 0}
                      onClick={() => activePersonId && assignItem(item.lineId, activePersonId, Math.max(0, activeAssigned - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-pos-bg text-pos-text disabled:opacity-30"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-4 text-center text-xs font-bold">{activeAssigned}</span>
                    <button
                      disabled={!activePersonId || remaining <= 0}
                      onClick={() => activePersonId && assignItem(item.lineId, activePersonId, activeAssigned + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-pos-accent text-white disabled:opacity-30"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {splitMethod === 'manual' && (
        <div className="space-y-2.5">
          {people.map((person) => (
            <div key={person.id} className="flex items-center justify-between rounded-xl border border-pos-border bg-pos-surface p-3">
              <span className="text-sm font-semibold text-pos-text">{person.label}</span>
              <input
                type="number"
                value={person.manualAmount ?? ''}
                onChange={(e) => setManualAmount(person.id, Number(e.target.value) || 0)}
                placeholder="0"
                className="w-28 rounded-lg border border-pos-border px-2.5 py-1.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
              />
            </div>
          ))}
        </div>
      )}

      {!isFullyAssigned && (
        <div className="flex items-center gap-2 rounded-xl bg-pos-warning/10 p-3 text-xs font-semibold text-pos-warning">
          <AlertTriangle size={15} className="shrink-0" />
          {unassignedAmount > 0
            ? `في ${unassignedAmount.toFixed(2)} ${CURRENCY} لسا ما انسندت لحدا — لازم توزعيها كلها قبل إتمام الدفع`
            : `المجموع الموزّع أكبر من الفاتورة بمقدار ${Math.abs(unassignedAmount).toFixed(2)} ${CURRENCY} — راجعي التوزيع`}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-pos-text">حالة الدفع لكل شخص</h3>
        {people.map((person) => (
          <PersonCard key={person.id} person={person} amountDue={personAmounts[person.id] ?? 0} onPay={handlePay} />
        ))}
      </div>

      <div className="space-y-1.5 rounded-2xl border border-pos-border bg-pos-surface p-4 text-sm">
        <div className="flex justify-between text-pos-text-soft">
          <span>إجمالي الفاتورة</span>
          <span>{total.toFixed(2)} {CURRENCY}</span>
        </div>
        <div className="flex justify-between text-pos-text-soft">
          <span>إجمالي المدفوع</span>
          <span>{totalPaid.toFixed(2)} {CURRENCY}</span>
        </div>
        <div className="flex justify-between border-t border-dashed border-pos-border pt-2 text-base font-extrabold text-pos-navy-900">
          <span>المتبقي</span>
          <span>{grandRemaining.toFixed(2)} {CURRENCY}</span>
        </div>
      </div>

      {!canComplete && grandRemaining > 0.01 && isFullyAssigned && (
        <button
          onClick={() => setShowApprovalPrompt(true)}
          className="rounded-xl border border-dashed border-pos-warning py-2.5 text-xs font-bold text-pos-warning"
        >
          طلب موافقة مدير لإغلاق الفاتورة رغم وجود متبقي
        </button>
      )}
      {managerApprovedBy && <p className="text-[11px] font-semibold text-pos-success">تمت الموافقة من: {managerApprovedBy}</p>}

      <button
        onClick={handleComplete}
        disabled={!canComplete || submitting}
        className="rounded-xl bg-pos-navy-900 py-4 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
      >
        {submitting ? 'جاري الإرسال...' : 'إتمام الدفع وطباعة الفاتورة'}
      </button>

      {showApprovalPrompt && (
        <ManagerApprovalPrompt
          title="في مبلغ متبقي لسا ما انسدد — لازم موافقة مدير لإغلاق الفاتورة"
          onApprove={(name) => {
            setManagerApprovedBy(name);
            setShowApprovalPrompt(false);
          }}
          onCancel={() => setShowApprovalPrompt(false)}
        />
      )}
    </div>
  );
}
