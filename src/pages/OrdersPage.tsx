import { useEffect, useMemo, useState } from 'react';
import { Search, Ban, RotateCcw, ClipboardList } from 'lucide-react';
import { useOrdersStore } from '../store/ordersStore';
import { useAuthStore } from '../store/authStore';
import { canCancelCompletedOrder } from '../utils/permissions';
import type { Order, OrderStatus, PaymentMethod } from '../types';
import { CURRENCY } from '../data/demoData';
import ManagerApprovalPrompt from '../components/auth/ManagerApprovalPrompt';

const STATUS_TABS: { id: OrderStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'open', label: 'مفتوحة' },
  { id: 'completed', label: 'مكتملة' },
  { id: 'pending', label: 'معلقة' },
  { id: 'cancelled', label: 'ملغاة' },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  open: 'bg-pos-accent/10 text-pos-accent',
  completed: 'bg-pos-success/10 text-pos-success',
  pending: 'bg-pos-warning/10 text-pos-warning',
  cancelled: 'bg-pos-danger/10 text-pos-danger',
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'مفتوحة',
  completed: 'مكتملة',
  pending: 'معلقة',
  cancelled: 'ملغاة',
};

const TYPE_LABEL: Record<Order['orderType'], string> = {
  'dine-in': 'داخل المطعم',
  takeaway: 'سفري',
  delivery: 'توصيل',
  pickup: 'استلام',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  wallet: 'محفظة',
  'bank-transfer': 'تحويل',
  other: 'أخرى',
};

export default function OrdersPage() {
  const { orders, cancelOrder, fetchOrders } = useOrdersStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [pendingCancelOrder, setPendingCancelOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 12000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesTab = activeTab === 'all' || o.status === activeTab;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query || o.orderNumber.toLowerCase().includes(query) || (o.tableNumber ?? '').toLowerCase().includes(query);
      return matchesTab && matchesSearch;
    });
  }, [orders, activeTab, search]);

  function requestCancel(order: Order) {
    if (currentUser && !canCancelCompletedOrder(currentUser.role)) {
      setPendingCancelOrder(order);
      return;
    }
    doCancel(order);
  }

  function doCancel(order: Order) {
    const reason = prompt(`سبب إلغاء الطلب ${order.orderNumber}؟`);
    if (reason === null) return;
    cancelOrder(order.id, reason || 'بدون سبب محدد');
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <ClipboardList size={18} />
          الطلبات
        </h1>
        <div className="relative">
          <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-pos-text-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو الطاولة..."
            className="w-64 rounded-lg border border-pos-border bg-pos-bg py-2 ps-3 pe-9 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
        </div>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${
                activeTab === tab.id ? 'bg-pos-navy-900 text-white' : 'border border-pos-border bg-pos-surface text-pos-text-soft'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-pos-text-soft">
            <ClipboardList size={32} className="opacity-30" />
            <p className="text-sm">ما في طلبات مطابقة — الطلبات المدفوعة من الكاشير بتظهر هون تلقائياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((order) => (
              <div key={order.id} className="rounded-2xl border border-pos-border bg-pos-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-pos-navy-900">{order.orderNumber}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-pos-text-soft">
                  <p>
                    {TYPE_LABEL[order.orderType]}
                    {order.tableNumber && ` — طاولة ${order.tableNumber}`}
                  </p>
                  <p>الكاشير: {order.cashierName}</p>
                  <p>{order.itemCount} أصناف — {order.paymentMethods.map((m) => METHOD_LABEL[m]).join('، ')}</p>
                  <p>{new Date(order.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-dashed border-pos-border pt-2.5">
                  <span className="text-base font-extrabold text-pos-navy-900">
                    {order.total.toFixed(2)} {CURRENCY}
                  </span>
                  {order.status === 'completed' && (
                    <button
                      onClick={() => requestCancel(order)}
                      className="flex items-center gap-1 rounded-lg border border-pos-danger/30 px-2.5 py-1.5 text-[11px] font-bold text-pos-danger"
                    >
                      <Ban size={12} /> إلغاء
                    </button>
                  )}
                  {order.status === 'cancelled' && order.cancelReason && (
                    <span className="flex items-center gap-1 text-[11px] text-pos-text-soft">
                      <RotateCcw size={12} /> {order.cancelReason}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingCancelOrder && (
        <ManagerApprovalPrompt
          title={`إلغاء طلب مكتمل (${pendingCancelOrder.orderNumber}) بيحتاج موافقة مدير`}
          onApprove={() => {
            const order = pendingCancelOrder;
            setPendingCancelOrder(null);
            doCancel(order);
          }}
          onCancel={() => setPendingCancelOrder(null)}
        />
      )}
    </div>
  );
}
