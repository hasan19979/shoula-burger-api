import { CheckCircle2, Printer, Send, PlusCircle } from 'lucide-react';
import type { CartItem, CompletedPayment, OrderType } from '../../types';
import { CURRENCY } from '../../data/demoData';
import { useCartStore } from '../../store/cartStore';
import { usePrintCoordinator } from '../../store/printCoordinator';

interface Props {
  payment: CompletedPayment;
  items: CartItem[];
  orderType: OrderType;
  tableNumber: string | null;
  cashierName: string;
  onNewOrder: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  wallet: 'محفظة إلكترونية',
  'bank-transfer': 'تحويل بنكي',
  other: 'أخرى',
};

export default function PaymentSuccessView({ payment, items, orderType, tableNumber, onNewOrder }: Props) {
  const { customerName, customerPhone, deliveryAddress } = useCartStore();
  const requestPrint = usePrintCoordinator((s) => s.requestPrint);

  function handlePrint() {
    requestPrint({ type: 'payment', payment, items, orderType, tableNumber, customerName, customerPhone, deliveryAddress });
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pos-success/10 text-pos-success">
        <CheckCircle2 size={34} />
      </span>
      <div>
        <h3 className="text-lg font-bold text-pos-text">تم الدفع بنجاح</h3>
        <p className="text-sm text-pos-text-soft">طلب رقم {payment.orderNumber}</p>
        {payment.orderNumber.startsWith('OFFLINE-') && (
          <p className="mt-2 rounded-lg bg-pos-warning/10 px-3 py-2 text-xs font-semibold text-pos-warning">
            ⚠️ ما في نت حالياً — الطلب محفوظ بالجهاز وبينبعت أوتوماتيك للسيرفر لما يرجع الاتصال
          </p>
        )}
      </div>

      <div className="w-full space-y-1.5 rounded-2xl border border-pos-border bg-pos-surface p-4 text-sm">
        <div className="flex justify-between text-pos-text-soft">
          <span>طريقة الدفع</span>
          <span className="font-semibold text-pos-text">{METHOD_LABELS[payment.primaryMethod]}</span>
        </div>
        {payment.discountAmount > 0 && (
          <div className="flex justify-between text-pos-warning">
            <span>الخصم</span>
            <span>-{payment.discountAmount.toFixed(2)} {CURRENCY}</span>
          </div>
        )}
        {payment.primaryMethod === 'cash' && (
          <>
            <div className="flex justify-between text-pos-text-soft">
              <span>المبلغ المستلم</span>
              <span>{payment.amountPaid.toFixed(2)} {CURRENCY}</span>
            </div>
            <div className="flex justify-between text-pos-text-soft">
              <span>الباقي</span>
              <span>{payment.changeDue.toFixed(2)} {CURRENCY}</span>
            </div>
          </>
        )}
        <div className="flex justify-between border-t border-dashed border-pos-border pt-2 text-base font-extrabold text-pos-navy-900">
          <span>الإجمالي</span>
          <span>{payment.total.toFixed(2)} {CURRENCY}</span>
        </div>
      </div>

      <p className="text-[11px] text-pos-text-soft">📠 بتنطبع تلقائياً بجهاز الطباعة — الزر تحت للطباعة اليدوية من هاد الجهاز بس لو احتجتيه</p>

      <div className="grid w-full grid-cols-1 gap-2.5">
        <button onClick={handlePrint} className="flex items-center justify-center gap-2 rounded-xl border border-pos-border bg-pos-surface py-3 text-xs font-bold text-pos-text">
          <Printer size={15} /> طباعة يدوية من هاد الجهاز
        </button>
        <button className="flex items-center justify-center gap-2 rounded-xl border border-pos-border bg-pos-surface py-3 text-xs font-bold text-pos-text">
          <Send size={15} /> إرسال الفاتورة
        </button>
      </div>

      <button
        onClick={onNewOrder}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-pos-accent py-4 text-sm font-bold text-white transition-transform active:scale-[0.98]"
      >
        <PlusCircle size={17} /> طلب جديد
      </button>
    </div>
  );
}
