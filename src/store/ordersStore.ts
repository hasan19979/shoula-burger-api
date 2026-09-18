import { create } from 'zustand';
import type { KitchenStatus, Order, OrderStatus, OrderType, PaymentMethod } from '../types';
import { apiRequest } from '../services/api';

interface ApiOrderItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
  included_ingredients: string[] | string | null; // JSONB يوصل مُفكوك تلقائياً كمصفوفة، مش نص يحتاج JSON.parse
  print_order?: number;
}

interface ApiOrder {
  id: number;
  order_no: string;
  order_type: OrderType;
  table_number: string | null;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  payment_method: PaymentMethod;
  status: string;
  kitchen_status: KitchenStatus;
  cashier_name: string | null;
  customer_name: string;
  customer_phone: string;
  address: string;
  order_source: 'online' | 'pos';
  created_at: string;
  items?: ApiOrderItem[];
  cancelled_by?: string;
  cancelled_at?: string;
  cancel_reason?: string;
}

function mapStatus(s: string): OrderStatus {
  if (s === 'cancelled') return 'cancelled';
  if (s === 'pending' || s === 'accepted' || s === 'preparing' || s === 'ready') return 'pending';
  return 'completed';
}

function mapOrder(o: ApiOrder): Order {
  const items = (o.items || []).map((it) => ({
    id: String(it.id),
    productName: it.product_name,
    quantity: it.quantity,
    unitPrice: Number(it.unit_price),
    lineTotal: Number(it.line_total),
    includedIngredients: Array.isArray(it.included_ingredients)
      ? it.included_ingredients
      : typeof it.included_ingredients === 'string' && it.included_ingredients
      ? (() => { try { return JSON.parse(it.included_ingredients as string); } catch { return []; } })()
      : [],
    printOrder: it.print_order ?? 999,
  }));

  return {
    id: String(o.id),
    orderNumber: o.order_no,
    orderType: o.order_type,
    tableNumber: o.table_number,
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discount),
    total: Number(o.total),
    amountPaid: Number(o.total),
    paymentMethods: [o.payment_method],
    status: mapStatus(o.status),
    kitchenStatus: o.kitchen_status,
    cashierName: o.cashier_name || (o.order_source === 'online' ? 'الموقع' : 'غير معروف'),
    customerName: o.customer_name || '',
    customerPhone: o.customer_phone || '',
    address: o.address || '',
    createdAt: o.created_at,
    orderSource: o.order_source,
    cancelledBy: o.cancelled_by,
    cancelledAt: o.cancelled_at,
    cancelReason: o.cancel_reason,
  };
}

interface OrdersState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  cancelOrder: (orderId: string, reason: string) => Promise<void>;
  setKitchenStatus: (orderId: string, status: KitchenStatus) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  loading: false,
  error: null,

  fetchOrders: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ApiOrder[]>('/orders', { auth: true });
      set({ orders: data.map(mapOrder), loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل الطلبات' });
    }
  },

  cancelOrder: async (orderId, reason) => {
    await apiRequest(`/orders/${orderId}/status`, { method: 'PATCH', auth: true, body: { status: 'cancelled', cancelReason: reason } });
    await get().fetchOrders();
  },

  setKitchenStatus: async (orderId, kitchenStatus) => {
    await apiRequest(`/orders/${orderId}/kitchen-status`, { method: 'PATCH', auth: true, body: { kitchenStatus } });
    set((state) => ({ orders: state.orders.map((o) => (o.id === orderId ? { ...o, kitchenStatus } : o)) }));
  },
}));
