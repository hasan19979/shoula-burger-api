import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Radio } from 'lucide-react';
import { useOrdersStore } from '../store/ordersStore';
import { useRealtimeNewOrder } from '../hooks/useRealtimeNewOrder';
import type { Order } from '../types';
import WhatsAppOrderCard from '../components/whatsapp-orders/WhatsAppOrderCard';
import WhatsAppOrderTicket from '../components/whatsapp-orders/WhatsAppOrderTicket';

export default function WhatsAppOrdersPage() {
  const { orders, setKitchenStatus, fetchOrders } = useOrdersStore();
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // بث لحظي (Socket.IO) — الطلب بيوصل فوراً لحظة ما ينحفظ بالسيرفر، مع صوت تنبيه
  useRealtimeNewOrder(fetchOrders);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // بس طلبات الموقع/واتساب يلي لسا ما انطبعت (مش محوّلة للمطبخ بعد)
  const pendingOrders = useMemo(
    () =>
      orders
        .filter((o) => o.orderSource === 'online' && o.status !== 'cancelled' && o.kitchenStatus !== 'served')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders]
  );

  async function handlePrint(order: Order) {
    setPrintingOrder(order);
    setBusyId(order.id);
    // نستنى تيك حتى تتحدث ورقة الطباعة بالطلب الصحيح قبل ما نفتح نافذة الطباعة
    setTimeout(async () => {
      window.print();
      try {
        await setKitchenStatus(order.id, 'served');
      } finally {
        setBusyId(null);
      }
    }, 50);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <MessageCircle size={18} />
          طلبات الواتساب
          {pendingOrders.length > 0 && (
            <span className="rounded-full bg-pos-danger/10 px-2 py-0.5 text-[11px] font-bold text-pos-danger">
              {pendingOrders.length} بانتظار الطباعة
            </span>
          )}
        </h1>
        <span className="flex items-center gap-1.5 rounded-full bg-pos-success/10 px-3 py-1.5 text-[11px] font-bold text-pos-success">
          <Radio size={12} /> اتصال لحظي شغّال
        </span>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        {pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-pos-text-soft">
            <MessageCircle size={32} className="opacity-30" />
            <p className="text-sm">ما في طلبات واتساب بانتظار الطباعة حالياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pendingOrders.map((order) => (
              <WhatsAppOrderCard key={order.id} order={order} onPrint={handlePrint} printing={busyId === order.id} />
            ))}
          </div>
        )}
      </div>

      {printingOrder && <WhatsAppOrderTicket order={printingOrder} />}
    </div>
  );
}
