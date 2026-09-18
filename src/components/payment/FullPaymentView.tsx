import { useMemo, useState } from 'react';
import { ArrowRight, Banknote, CreditCard, Landmark, Wallet, MoreHorizontal, Star, Search, MapPin } from 'lucide-react';
import type { CompletedPayment, DiscountType, OrderType, PaymentMethod } from '../../types';
import type { LoyaltyLookup, AddressHistory } from '../../store/customersStore';
import { useCheckoutStore } from '../../store/checkoutStore';
import { useAuthStore } from '../../store/authStore';
import { canApplyDiscount, MAX_CASHIER_DISCOUNT_PERCENT } from '../../utils/permissions';
import { generateOrderNumber, suggestQuickAmounts } from '../../utils/calculations';
import { CURRENCY } from '../../data/demoData';
import ManagerApprovalPrompt from '../auth/ManagerApprovalPrompt';
import KeyboardInput from '../keyboard/KeyboardInput';

const METHODS: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { id: 'cash', label: 'نقدي', icon: Banknote },
  { id: 'card', label: 'بطاقة', icon: CreditCard },
  { id: 'wallet', label: 'محفظة إلكترونية', icon: Wallet },
  { id: 'bank-transfer', label: 'تحويل بنكي', icon: Landmark },
  { id: 'other', label: 'أخرى', icon: MoreHorizontal },
];

const POINT_VALUE = 0.5; // نفس القيمة المحسوبة بالسيرفر — هون بس للعرض المسبق قبل التأكيد

interface Props {
  subtotal: number;
  discountAmount: number;
  total: number;
  onComplete: (payment: CompletedPayment) => void;
  onBack: () => void;
  submitting?: boolean;
  customerPhone: string;
  onCustomerPhoneChange: (phone: string) => void;
  loyaltyInfo: LoyaltyLookup | null;
  onLookupPhone: () => void;
  redeemPoints: number;
  onRedeemPointsChange: (points: number) => void;
  orderType: OrderType;
  addressHistory: AddressHistory | null;
  deliveryAddress: string;
  onDeliveryAddressChange: (address: string) => void;
}

export default function FullPaymentView({
  subtotal, discountAmount, total, onComplete, onBack, submitting,
  customerPhone, onCustomerPhoneChange, loyaltyInfo, onLookupPhone, redeemPoints, onRedeemPointsChange,
  orderType, addressHistory, deliveryAddress, onDeliveryAddressChange,
}: Props) {
  const { discount, setDiscount } = useCheckoutStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>(discount?.type ?? 'percent');
  const [discountValue, setDiscountValue] = useState(discount?.value ?? 0);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);

  const pointsDiscount = redeemPoints * POINT_VALUE;
  const finalTotal = Math.max(0, total - pointsDiscount);

  const quickAmounts = useMemo(() => suggestQuickAmounts(finalTotal), [finalTotal]);
  const receivedNum = Number(received) || 0;
  const changeDue = method === 'cash' ? receivedNum - finalTotal : 0;
  const hasRequiredAddress = orderType !== 'delivery' || deliveryAddress.trim().length > 0;
  const canConfirm = (method !== 'cash' || receivedNum >= finalTotal) && hasRequiredAddress;

  function applyDiscount() {
    if (discountValue <= 0) {
      setDiscount(null);
      return;
    }
    const percentEquivalent = discountType === 'percent' ? discountValue : (discountValue / subtotal) * 100;
    if (!currentUser || (!canApplyDiscount(currentUser.role, percentEquivalent) && !approvedBy)) {
      setPendingApproval(true);
      return;
    }
    setDiscount({ type: discountType, value: discountValue });
  }

  function handleConfirm() {
    const payment: CompletedPayment = {
      orderNumber: generateOrderNumber(),
      subtotal,
      discount: discountValue > 0 ? { type: discountType, value: discountValue } : null,
      discountAmount: discountAmount + pointsDiscount,
      total: finalTotal,
      amountPaid: method === 'cash' ? receivedNum : finalTotal,
      changeDue: method === 'cash' ? Math.max(0, changeDue) : 0,
      primaryMethod: method,
      completedAt: new Date().toISOString(),
    };
    onComplete(payment);
  }

  return (
    <div className="flex flex-col gap-5">
      <button onClick={onBack} className="flex w-fit items-center gap-1.5 text-xs font-semibold text-pos-text-soft">
        <ArrowRight size={14} /> رجوع
      </button>

      {/* رقم الجوال — لنقاط الولاء وكمان لاقتراح عنوان التوصيل من الطلبات السابقة */}
      <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-pos-text">
          <Star size={15} className="text-pos-warning" /> رقم جوال الزبون {orderType !== 'delivery' && '(اختياري — لنقاط الولاء)'}
        </h3>
        <div className="flex gap-2">
          <KeyboardInput
            value={customerPhone}
            onChange={onCustomerPhoneChange}
            mode="numeric"
            placeholder="05xxxxxxxx"
            className="flex-1 rounded-lg border border-pos-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
          <button onClick={onLookupPhone} className="flex items-center gap-1.5 rounded-lg bg-pos-navy-900 px-3.5 py-2 text-xs font-bold text-white">
            <Search size={13} /> بحث
          </button>
        </div>
        {loyaltyInfo && (
          <div className="mt-3 rounded-lg bg-pos-warning/10 p-3">
            <p className="text-xs font-semibold text-pos-text">{loyaltyInfo.name} — رصيد {loyaltyInfo.loyalty_points} نقطة</p>
            {loyaltyInfo.loyalty_points > 0 && (
              <div className="mt-2">
                <label className="mb-1 block text-[11px] text-pos-text-soft">نقاط تستخدمها الآن (كل نقطة = {POINT_VALUE}{CURRENCY})</label>
                <KeyboardInput
                  value={redeemPoints ? String(redeemPoints) : ''}
                  onChange={(v) => onRedeemPointsChange(Math.min(loyaltyInfo.loyalty_points, Math.max(0, Number(v) || 0)))}
                  mode="numeric"
                  placeholder="0"
                  className="w-full rounded-lg border border-pos-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* عنوان التوصيل — بيظهر بس لطلبات التوصيل، ومقترح تلقائياً من عناوين سابقة لنفس الرقم */}
      {orderType === 'delivery' && (
        <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-pos-text">
            <MapPin size={15} className="text-pos-accent" /> عنوان التوصيل *
          </h3>

          {addressHistory && addressHistory.addresses.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] text-pos-text-soft">عناوين سابقة لهاد الرقم — دوسي لاختيار وحد</p>
              <div className="pos-scroll flex gap-1.5 overflow-x-auto pb-1">
                {addressHistory.addresses.map((addr) => (
                  <button
                    key={addr}
                    onClick={() => onDeliveryAddressChange(addr)}
                    className={`shrink-0 max-w-[200px] truncate rounded-lg border px-3 py-2 text-[11.5px] ${
                      deliveryAddress === addr ? 'border-pos-accent bg-pos-accent/10 font-bold text-pos-accent' : 'border-pos-border text-pos-text-soft'
                    }`}
                    title={addr}
                  >
                    {addr}
                  </button>
                ))}
              </div>
            </div>
          )}

          <KeyboardInput
            value={deliveryAddress}
            onChange={onDeliveryAddressChange}
            mode="text"
            placeholder="الحي، الشارع، أقرب معلم"
            className="w-full rounded-lg border border-pos-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
          {!hasRequiredAddress && <p className="mt-1.5 text-[11px] font-semibold text-pos-danger">لازم تحطي عنوان قبل ما تأكدي الدفع</p>}
        </div>
      )}

      {/* الخصم */}
      <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
        <h3 className="mb-3 text-sm font-bold text-pos-text">خصم (اختياري)</h3>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-pos-border p-1">
            <button
              onClick={() => setDiscountType('percent')}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${discountType === 'percent' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}
            >
              %
            </button>
            <button
              onClick={() => setDiscountType('fixed')}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${discountType === 'fixed' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}
            >
              {CURRENCY}
            </button>
          </div>
          <KeyboardInput
            value={discountValue ? String(discountValue) : ''}
            onChange={(v) => setDiscountValue(Number(v) || 0)}
            onClose={applyDiscount}
            mode="numeric"
            placeholder="0"
            className="flex-1 rounded-lg border border-pos-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
        </div>
        {currentUser && currentUser.role === 'cashier' && (
          <p className="mt-2 text-[11px] text-pos-text-soft">
            الحد المسموح للكاشير: {MAX_CASHIER_DISCOUNT_PERCENT}% — أي خصم أكبر بيحتاج موافقة مدير
          </p>
        )}
        {approvedBy && <p className="mt-2 text-[11px] font-semibold text-pos-success">تمت الموافقة من: {approvedBy}</p>}
      </div>

      {/* ملخص المبالغ */}
      <div className="space-y-1.5 rounded-2xl border border-pos-border bg-pos-surface p-4 text-sm">
        <div className="flex justify-between text-pos-text-soft">
          <span>المجموع الفرعي</span>
          <span>{subtotal.toFixed(2)} {CURRENCY}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-pos-warning">
            <span>الخصم</span>
            <span>-{discountAmount.toFixed(2)} {CURRENCY}</span>
          </div>
        )}
        {pointsDiscount > 0 && (
          <div className="flex justify-between text-pos-warning">
            <span>نقاط الولاء ({redeemPoints} نقطة)</span>
            <span>-{pointsDiscount.toFixed(2)} {CURRENCY}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-dashed border-pos-border pt-2 text-base font-extrabold text-pos-navy-900">
          <span>الإجمالي</span>
          <span>{finalTotal.toFixed(2)} {CURRENCY}</span>
        </div>
      </div>

      {/* طريقة الدفع */}
      <div>
        <h3 className="mb-2.5 text-sm font-bold text-pos-text">طريقة الدفع</h3>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-semibold ${
                  active ? 'border-pos-accent bg-pos-accent/10 text-pos-accent' : 'border-pos-border text-pos-text-soft'
                }`}
              >
                <Icon size={18} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {method === 'cash' && (
        <div className="rounded-2xl border border-pos-border bg-pos-surface p-4">
          <label className="mb-2 block text-sm font-bold text-pos-text">المبلغ المستلم</label>
          <KeyboardInput
            value={received}
            onChange={setReceived}
            mode="numeric"
            placeholder={finalTotal.toFixed(2)}
            className="mb-3 w-full rounded-xl border border-pos-border px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setReceived(String(amount))}
                className="rounded-lg border border-pos-border bg-pos-bg px-3 py-1.5 text-xs font-bold text-pos-text"
              >
                {amount} {CURRENCY}
              </button>
            ))}
          </div>
          <div className={`rounded-xl p-3 text-center ${changeDue >= 0 ? 'bg-pos-success/10' : 'bg-pos-danger/10'}`}>
            <p className="text-xs text-pos-text-soft">{changeDue >= 0 ? 'الباقي للزبون' : 'ناقص'}</p>
            <p className={`text-2xl font-extrabold ${changeDue >= 0 ? 'text-pos-success' : 'text-pos-danger'}`}>
              {Math.abs(changeDue).toFixed(2)} {CURRENCY}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm || submitting}
        className="rounded-xl bg-pos-navy-900 py-4 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
      >
        {submitting ? 'جاري الإرسال...' : 'تأكيد الدفع'}
      </button>

      {pendingApproval && (
        <ManagerApprovalPrompt
          title={`الخصم المطلوب أكبر من الحد المسموح للكاشير (${MAX_CASHIER_DISCOUNT_PERCENT}%)`}
          onApprove={(name) => {
            setApprovedBy(name);
            setPendingApproval(false);
            setDiscount({ type: discountType, value: discountValue });
          }}
          onCancel={() => setPendingApproval(false)}
        />
      )}
    </div>
  );
}
