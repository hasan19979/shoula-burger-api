import { useState } from 'react';
import { AlertCircle, CreditCard, Users, X } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { useCheckoutStore } from '../../store/checkoutStore';
import { useOrdersStore } from '../../store/ordersStore';
import { useTablesStore, findTableByNumber } from '../../store/tablesStore';
import { useAuthStore } from '../../store/authStore';
import { apiRequest, ApiError } from '../../services/api';
import { useOfflineQueueStore, generateLocalOrderId } from '../../store/offlineQueueStore';
import { useCustomersStore, type LoyaltyLookup, type AddressHistory } from '../../store/customersStore';
import { calculateCartSubtotal, calculateDiscountAmount } from '../../utils/calculations';
import { CURRENCY } from '../../data/demoData';
import type { CompletedPayment, PaymentMethod } from '../../types';
import FullPaymentView from './FullPaymentView';
import SplitBillView from './SplitBillView';
import PaymentSuccessView from './PaymentSuccessView';

type Step = 'menu' | 'full' | 'split' | 'success';

interface Props {
  onClose: () => void;
}

interface ApiPosOrder {
  order_no: string;
  total: string | number;
}

export default function PaymentModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('menu');
  const [completedPayment, setCompletedPayment] = useState<CompletedPayment | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { items, orderType, tableNumber, clearCart, customerPhone, customerName, deliveryAddress, setCustomerPhone, setDeliveryAddress } = useCartStore();
  const { discount, people, resetCheckout } = useCheckoutStore();
  const fetchOrders = useOrdersStore((s) => s.fetchOrders);
  const { tables, markNeedsCleaning } = useTablesStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const addPendingOffline = useOfflineQueueStore((s) => s.addPending);
  const lookupByPhone = useCustomersStore((s) => s.lookupByPhone);
  const fetchAddressHistory = useCustomersStore((s) => s.fetchAddressHistory);

  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyLookup | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [addressHistory, setAddressHistory] = useState<AddressHistory | null>(null);

  async function handleLookupPhone() {
    if (!customerPhone.trim()) return;
    const [info, addresses] = await Promise.all([
      lookupByPhone(customerPhone.trim()),
      fetchAddressHistory(customerPhone.trim()),
    ]);
    setLoyaltyInfo(info);
    setRedeemPoints(0);
    setAddressHistory(addresses);
    if (addresses.addresses.length > 0) setDeliveryAddress(addresses.addresses[0]); // نقترح آخر عنوان استخدمته تلقائياً
  }

  const subtotal = calculateCartSubtotal(items);
  const discountAmount = calculateDiscountAmount(subtotal, discount);
  const total = subtotal - discountAmount;

  async function handlePaymentComplete(payment: CompletedPayment) {
    const paymentMethods: PaymentMethod[] =
      step === 'split'
        ? Array.from(new Set(people.flatMap((p) => p.payments.map((pay) => pay.method))))
        : [payment.primaryMethod];

    const orderBody = {
      items: items.map((i) => ({
        productId: Number(i.product.id),
        quantity: i.quantity,
        modifierOptionIds: i.selectedModifiers.map((m) => Number(m.optionId)).filter((n) => !isNaN(n)),
        includedIngredients: i.selectedModifiers.length ? undefined : i.removedIngredients.length ? [] : undefined,
      })),
      paymentMethod: paymentMethods[0] || 'cash',
      tableNumber: orderType === 'dine-in' && tableNumber ? tableNumber : undefined,
      orderType,
      address: orderType === 'delivery' ? deliveryAddress.trim() : undefined,
      kitchenStatus: 'new',
      customerPhone: customerPhone.trim() || undefined,
      customerName: customerName.trim() || loyaltyInfo?.name || undefined,
      redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      // بنبعت الطلب فعلياً للسيرفر — هو اللي بيحسب الأسعار الحقيقية (حتى أسعار الإضافات) ويسجّله رسمياً
      const created = await apiRequest<ApiPosOrder>('/orders/pos', { method: 'POST', auth: true, body: orderBody });
      const finalPayment: CompletedPayment = { ...payment, orderNumber: created.order_no, total: Number(created.total) };
      finishSale(finalPayment);
      fetchOrders(); // تحديث شاشتي الطلبات والمطبخ بالخلفية حتى يظهر الطلب فوراً
    } catch (err) {
      if (err instanceof ApiError) {
        // خطأ حقيقي رجع من السيرفر (مثلاً صنف نفذ) — مش مشكلة اتصال، لازم تشوفه الكاشير وتتصرف
        setSubmitError(err.message);
      } else {
        // فشل الاتصال بالسيرفر (بدون نت) — البيع بيكمل عادي، والطلب بيتخزن محلياً وبينبعت أوتوماتيك لما يرجع النت
        const localId = generateLocalOrderId();
        addPendingOffline({ localId, createdAt: new Date().toISOString(), body: orderBody });
        const offlinePayment: CompletedPayment = { ...payment, orderNumber: localId };
        finishSale(offlinePayment);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function finishSale(payment: CompletedPayment) {
    // خصم المخزون صار يصير بالسيرفر مباشرة (جوا POST /orders/pos)، ما عاد في داعي نعمله محلياً هون

    // لو الطلب كان لطاولة متتبّعة بشاشة "الطاولات"، حرّرها تلقائياً (تصير "بحاجة تنظيف")
    if (orderType === 'dine-in' && tableNumber) {
      const table = findTableByNumber(tables, tableNumber);
      if (table) markNeedsCleaning(table.id);
    }

    setCompletedPayment(payment);
    setStep('success');
  }

  function handleNewOrder() {
    clearCart();
    resetCheckout();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 md:items-center md:justify-center">
      <div className="flex h-full w-full max-w-md flex-col bg-pos-bg shadow-2xl md:h-auto md:max-h-[92vh] md:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-5 py-4 md:rounded-t-2xl">
          <h2 className="text-base font-bold text-pos-text">
            {step === 'menu' && 'الدفع'}
            {step === 'full' && 'دفع كامل'}
            {step === 'split' && 'تقسيم الفاتورة'}
            {step === 'success' && 'تم الدفع بنجاح'}
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-pos-text-soft hover:bg-pos-bg">
            <X size={18} />
          </button>
        </div>

        <div className="pos-scroll flex-1 overflow-y-auto p-5">
          {submitError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-pos-danger/10 p-3 text-xs font-semibold text-pos-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {submitError}
            </div>
          )}

          {step === 'menu' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-pos-border bg-pos-surface p-5 text-center">
                <p className="text-xs text-pos-text-soft">المجموع الكلي</p>
                <p className="mt-1 text-3xl font-extrabold text-pos-navy-900">
                  {total.toFixed(2)} <span className="text-lg">{CURRENCY}</span>
                </p>
              </div>

              <button
                onClick={() => setStep('full')}
                className="flex items-center gap-3 rounded-2xl border border-pos-border bg-pos-surface p-4 text-right transition-colors hover:border-pos-accent"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pos-accent/10 text-pos-accent">
                  <CreditCard size={20} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-pos-text">الدفع الكامل</span>
                  <span className="block text-xs text-pos-text-soft">دفعة واحدة أو بأكتر من طريقة</span>
                </span>
              </button>

              <button
                onClick={() => setStep('split')}
                className="flex items-center gap-3 rounded-2xl border border-pos-border bg-pos-surface p-4 text-right transition-colors hover:border-pos-accent"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pos-warning/10 text-pos-warning">
                  <Users size={20} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-pos-text">تقسيم الفاتورة</span>
                  <span className="block text-xs text-pos-text-soft">حسب الأشخاص، الأصناف، أو يدوي</span>
                </span>
              </button>
            </div>
          )}

          {step === 'full' && (
            <FullPaymentView
              subtotal={subtotal}
              discountAmount={discountAmount}
              total={total}
              onComplete={handlePaymentComplete}
              onBack={() => setStep('menu')}
              submitting={submitting}
              customerPhone={customerPhone}
              onCustomerPhoneChange={setCustomerPhone}
              loyaltyInfo={loyaltyInfo}
              onLookupPhone={handleLookupPhone}
              redeemPoints={redeemPoints}
              onRedeemPointsChange={setRedeemPoints}
              orderType={orderType}
              addressHistory={addressHistory}
              deliveryAddress={deliveryAddress}
              onDeliveryAddressChange={setDeliveryAddress}
            />
          )}

          {step === 'split' && (
            <SplitBillView items={items} total={subtotal} onComplete={handlePaymentComplete} onBack={() => setStep('menu')} submitting={submitting} />
          )}

          {step === 'success' && completedPayment && (
            <PaymentSuccessView
              payment={completedPayment}
              items={items}
              orderType={orderType}
              tableNumber={tableNumber}
              cashierName={currentUser?.name ?? 'غير معروف'}
              onNewOrder={handleNewOrder}
            />
          )}
        </div>
      </div>
    </div>
  );
}
