import { useEffect, useState } from 'react';
import { ShoppingBag, X, ChevronUp } from 'lucide-react';
import type { CartItem, Product } from '../../types';
import { useCartStore } from '../../store/cartStore';
import { useCheckoutStore } from '../../store/checkoutStore';
import { calculateCartSubtotal, calculateCartItemPrice, calculateDiscountAmount } from '../../utils/calculations';
import { CURRENCY } from '../../data/demoData';
import CartItemRow from './CartItemRow';
import PaymentModal from '../payment/PaymentModal';
import InlineProductCustomize from './InlineProductCustomize';

interface Props {
  customizingProduct: Product | null;
  editingItem?: CartItem;
  onCloseCustomize: () => void;
  onEditItem: (item: CartItem) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export default function CartPanel({
  customizingProduct, editingItem, onCloseCustomize, onEditItem, mobileOpen, onMobileOpenChange,
}: Props) {
  const { items, clearCart } = useCartStore();
  const { discount, resetCheckout } = useCheckoutStore();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const subtotal = calculateCartSubtotal(items);
  const discountAmount = calculateDiscountAmount(subtotal, discount);
  const total = subtotal - discountAmount;

  // لو السلة فرغت بالكامل (بعد دفع ناجح مثلاً)، نرجّع نقفل اللوحة تلقائياً بالموبايل ونرجع لشبكة المنتجات
  useEffect(() => {
    if (items.length === 0 && !customizingProduct) onMobileOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function handleClearCart() {
    clearCart();
    resetCheckout();
  }

  return (
    <>
      {/* شريط عائم بالموبايل بس — يظهر لما تكون السلة فيها شي واللوحة الكاملة مسكّرة */}
      {!mobileOpen && items.length > 0 && (
        <button
          onClick={() => onMobileOpenChange(true)}
          className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom)+12px)] z-30 flex items-center justify-between rounded-2xl bg-pos-navy-900 px-4 py-3.5 text-white shadow-lg md:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingBag size={17} />
            {items.reduce((n, i) => n + i.quantity, 0)} صنف
          </span>
          <span className="flex items-center gap-1.5 text-sm font-extrabold">
            {total.toFixed(2)} {CURRENCY}
            <ChevronUp size={16} />
          </span>
        </button>
      )}

      <aside
        className={`fixed inset-0 z-50 flex flex-col border-s border-pos-border bg-pos-surface
          transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'}
          md:static md:translate-y-0 md:pointer-events-auto md:w-96 md:shrink-0`}
      >
        {/* زر إغلاق باللوحة — بالموبايل بس، بالديسكتوب اللوحة دايماً ظاهرة أصلاً */}
        <button
          onClick={() => onMobileOpenChange(false)}
          className="flex items-center gap-1.5 border-b border-pos-border px-4 py-3 text-xs font-bold text-pos-text-soft md:hidden"
        >
          <X size={16} /> رجوع للمنتجات
        </button>

        {customizingProduct && (
          <InlineProductCustomize product={customizingProduct} editingItem={editingItem} onDone={onCloseCustomize} />
        )}

        {/* ملخص الطلب — يصير مصغّر ومضغوط بالنص السفلي لما يكون فيه صنف قيد التخصيص فوق */}
        <div className={`flex flex-col ${customizingProduct ? 'shrink-0' : 'flex-1 min-h-0'}`}>
          <div className={`flex items-center justify-between border-b border-pos-border ${customizingProduct ? 'px-3 py-2' : 'px-4 py-4'}`}>
            <h2 className={`flex items-center gap-2 font-bold text-pos-text ${customizingProduct ? 'text-xs' : 'text-sm'}`}>
              <ShoppingBag size={customizingProduct ? 14 : 17} />
              الطلب الحالي {customizingProduct && items.length > 0 && `(${items.length})`}
            </h2>
            {items.length > 0 && (
              <button onClick={handleClearCart} className={`font-semibold text-pos-danger ${customizingProduct ? 'text-[11px]' : 'text-xs'}`}>
                إفراغ السلة
              </button>
            )}
          </div>

          <div className={`pos-scroll overflow-y-auto ${customizingProduct ? 'max-h-32 space-y-1.5 p-2' : 'flex-1 space-y-2.5 p-3'}`}>
            {items.length === 0 ? (
              <div className={`flex flex-col items-center justify-center gap-2 text-pos-text-soft ${customizingProduct ? 'py-4' : 'h-full'}`}>
                <ShoppingBag size={customizingProduct ? 18 : 30} className="opacity-30" />
                <p className={customizingProduct ? 'text-[11px]' : 'text-sm'}>السلة فاضية — اضغطي على أي صنف لإضافته</p>
              </div>
            ) : customizingProduct ? (
              // صف مصغّر سطر واحد لكل صنف وقت وضع التخصيص، بدل بطاقة كاملة
              items.map((item) => {
                const { lineTotal } = calculateCartItemPrice(item);
                return (
                  <div key={item.lineId} className="flex items-center justify-between rounded-lg bg-pos-bg px-2.5 py-1.5 text-[11px]">
                    <span className="truncate font-semibold text-pos-text">{item.product.name} ×{item.quantity}</span>
                    <span className="shrink-0 font-bold text-pos-navy-900">{lineTotal.toFixed(2)} {CURRENCY}</span>
                  </div>
                );
              })
            ) : (
              items.map((item) => <CartItemRow key={item.lineId} item={item} onEdit={onEditItem} />)
            )}
          </div>

          <div className={`shrink-0 border-t border-pos-border ${customizingProduct ? 'p-3' : 'p-4'}`}>
            <div className={`space-y-1 ${customizingProduct ? 'mb-2 text-[11px]' : 'mb-3 text-sm'}`}>
              {!customizingProduct && (
                <>
                  <div className="flex justify-between text-pos-text-soft">
                    <span>المجموع الفرعي</span>
                    <span>{subtotal.toFixed(2)} {CURRENCY}</span>
                  </div>
                  <div className="flex justify-between text-pos-text-soft">
                    <span>الخصم</span>
                    <span>{discountAmount > 0 ? `-${discountAmount.toFixed(2)} ${CURRENCY}` : '—'}</span>
                  </div>
                  <div className="flex justify-between text-pos-text-soft">
                    <span>الضريبة</span>
                    <span>—</span>
                  </div>
                </>
              )}
              <div className={`flex justify-between border-t border-dashed border-pos-border font-extrabold text-pos-navy-900 ${customizingProduct ? 'pt-1.5 text-sm' : 'pt-2 text-base'}`}>
                <span>المجموع النهائي</span>
                <span>{total.toFixed(2)} {CURRENCY}</span>
              </div>
            </div>
            <button
              disabled={items.length === 0}
              onClick={() => setPaymentOpen(true)}
              className={`w-full rounded-xl bg-pos-navy-900 font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40 ${
                customizingProduct ? 'py-2.5 text-xs' : 'py-3.5 text-sm'
              }`}
            >
              الدفع
            </button>
          </div>
        </div>

        {paymentOpen && <PaymentModal onClose={() => setPaymentOpen(false)} />}
      </aside>
    </>
  );
}
