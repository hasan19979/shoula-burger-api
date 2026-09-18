import { useState } from 'react';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import type { Person, PersonPaymentStatus, PaymentMethod } from '../../types';
import { sumPersonPayments } from '../../utils/calculations';
import { CURRENCY } from '../../data/demoData';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  wallet: 'محفظة',
  'bank-transfer': 'تحويل',
  other: 'أخرى',
};

interface Props {
  person: Person;
  amountDue: number;
  onPay: (personId: string, method: PaymentMethod, amount: number) => void;
}

function getStatus(paid: number, due: number): PersonPaymentStatus {
  if (due <= 0) return 'unpaid';
  if (paid >= due) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

const STATUS_CONFIG: Record<PersonPaymentStatus, { label: string; icon: React.ElementType; color: string }> = {
  paid: { label: 'مدفوع', icon: CheckCircle2, color: 'text-pos-success bg-pos-success/10' },
  partial: { label: 'مدفوع جزئياً', icon: CircleDot, color: 'text-pos-warning bg-pos-warning/10' },
  unpaid: { label: 'لم يدفع', icon: CircleDashed, color: 'text-pos-danger bg-pos-danger/10' },
};

export default function PersonCard({ person, amountDue, onPay }: Props) {
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');

  const paid = sumPersonPayments(person);
  const remaining = Math.max(0, amountDue - paid);
  const status = getStatus(paid, amountDue);
  const StatusIcon = STATUS_CONFIG[status].icon;

  function handlePay() {
    const value = Number(amount) || remaining;
    if (value <= 0) return;
    onPay(person.id, method, value);
    setAmount('');
    setPayOpen(false);
  }

  return (
    <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-pos-text">{person.label}</p>
          <p className="text-xs text-pos-text-soft">المستحق: {amountDue.toFixed(2)} {CURRENCY}</p>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CONFIG[status].color}`}>
          <StatusIcon size={12} />
          {STATUS_CONFIG[status].label}
        </span>
      </div>

      {paid > 0 && (
        <p className="mt-2 text-xs text-pos-text-soft">
          مدفوع: {paid.toFixed(2)} {CURRENCY} {remaining > 0 && `— متبقي: ${remaining.toFixed(2)} ${CURRENCY}`}
        </p>
      )}

      {status !== 'paid' && (
        <div className="mt-3">
          {!payOpen ? (
            <button
              onClick={() => setPayOpen(true)}
              className="w-full rounded-lg bg-pos-navy-900 py-2 text-xs font-bold text-white"
            >
              تسجيل دفعة
            </button>
          ) : (
            <div className="space-y-2 rounded-xl bg-pos-bg p-2.5">
              <div className="flex gap-1.5">
                {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 rounded-lg px-1 py-1.5 text-[10px] font-bold ${
                      method === m ? 'bg-pos-accent text-white' : 'bg-pos-surface text-pos-text-soft'
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={remaining.toFixed(2)}
                className="w-full rounded-lg border border-pos-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
              />
              <div className="flex gap-1.5">
                <button onClick={() => setPayOpen(false)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-pos-text-soft">
                  إلغاء
                </button>
                <button onClick={handlePay} className="flex-1 rounded-lg bg-pos-success py-1.5 text-xs font-bold text-white">
                  تأكيد
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
