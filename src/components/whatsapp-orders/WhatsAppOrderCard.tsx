import { Clock, Printer, MapPin, Phone } from 'lucide-react';
import type { Order, OrderType } from '../../types';
import { CURRENCY } from '../../data/demoData';

const TYPE_LABEL: Record<OrderType, string> = {
  'dine-in': 'داخل المطعم',
  takeaway: 'سفري',
  delivery: 'توصيل',
  pickup: 'استلام',
};

interface Props {
  order: Order;
  onPrint: (order: Order) => void;
  printing: boolean;
}

function useElapsedLabel(createdAt: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  let color = 'text-pos-success';
  if (minutes >= 15) color = 'text-pos-danger';
  else if (minutes >= 7) color = 'text-pos-warning';
  return { label: `${minutes} د`, color };
}

export default function WhatsAppOrderCard({ order, onPrint, printing }: Props) {
  const elapsed = useElapsedLabel(order.createdAt);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-pos-border bg-pos-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-base font-extrabold text-pos-navy-900">#{order.orderNumber}</span>
        <span className={`flex items-center gap-1 text-xs font-bold ${elapsed.color}`}>
          <Clock size={13} /> {elapsed.label}
        </span>
      </div>

      <div className="space-y-1 text-xs text-pos-text-soft">
        <p className="font-bold text-pos-text">{TYPE_LABEL[order.orderType]} — {order.customerName}</p>
        {order.customerPhone && (
          <p className="flex items-center gap-1.5">
            <Phone size={11} /> {order.customerPhone}
          </p>
        )}
        {order.address && (
          <p className="flex items-center gap-1.5">
            <MapPin size={11} /> {order.address}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-dashed border-pos-border pt-3">
        {order.items.map((item) => (
          <div key={item.id}>
            <p className="text-sm font-bold text-pos-text">
              {item.productName} ×{item.quantity}
            </p>
            {item.includedIngredients.length > 0 && (
              <p className="text-[11.5px] text-pos-text-soft">{item.includedIngredients.join('، ')}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-dashed border-pos-border pt-2 text-sm font-extrabold text-pos-navy-900">
        <span>الإجمالي</span>
        <span>{order.total.toFixed(2)} {CURRENCY}</span>
      </div>

      <button
        onClick={() => onPrint(order)}
        disabled={printing}
        className="flex items-center justify-center gap-2 rounded-xl bg-pos-navy-900 py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        <Printer size={16} /> {printing ? 'جاري الطباعة...' : 'طباعة وتحويل للمطبخ'}
      </button>
    </div>
  );
}
