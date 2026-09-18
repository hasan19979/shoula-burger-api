import { CURRENCY } from '../../data/demoData';
import { useSettingsStore } from '../../store/settingsStore';
import { groupAndSortForPrint, type PrintableLine } from '../../utils/printOrder';
import ReceiptTemplate from './ReceiptTemplate';
import type { ReceiptData, ReceiptOrderType } from '../../types/receipt';

interface BroadcastOrderItem {
  product_id?: number | null;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
  included_ingredients?: string[] | string | null;
  print_order?: number;
}

export interface BroadcastOrder {
  order_no: string;
  order_type: string;
  table_number: string | null;
  cashier_name: string | null;
  customer_name: string;
  customer_phone?: string;
  address?: string;
  subtotal: string | number;
  discount: string | number;
  delivery_fee?: string | number;
  total: string | number;
  payment_method: string;
  created_at: string;
  items?: BroadcastOrderItem[];
}

function parseIngredients(raw: BroadcastOrderItem['included_ingredients']): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

interface Props {
  order: BroadcastOrder;
}

/** تذكرة طباعة تلقائية — تُستخدم من "جهاز الطباعة" المحدد بس، بغض النظر مين الجهاز اللي سجّل الطلب أصلاً.
 * نفس تصميم الفاتورة الموحّد بكل مكان بالنظام. */
export default function PrintStationTicket({ order }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const orderType = (order.order_type as ReceiptOrderType) in { 'dine-in': 1, takeaway: 1, delivery: 1, pickup: 1 }
    ? (order.order_type as ReceiptOrderType)
    : 'dine-in';

  const printableLines: PrintableLine[] = (order.items || []).map((item, i) => ({
    productKey: item.product_id ?? item.product_name ?? i,
    productName: item.product_name,
    quantity: item.quantity,
    notes: parseIngredients(item.included_ingredients),
    printOrder: item.print_order ?? 999,
    lineTotal: Number(item.line_total),
  }));
  const sortedLines = groupAndSortForPrint(printableLines);

  const data: ReceiptData = {
    restaurantName: settings?.restaurant_name || 'شعلة برجر',
    tagline: settings?.tagline || undefined,
    restaurantPhone: settings?.whatsapp_number || undefined,
    orderNumber: order.order_no,
    orderType,
    createdAt: order.created_at,
    tableNumber: order.table_number,
    customer: orderType === 'delivery' ? { name: order.customer_name, phone: order.customer_phone && order.customer_phone !== '-' ? order.customer_phone : undefined, address: order.address } : undefined,
    items: sortedLines.map((l) => ({
      productKey: l.productKey,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.quantity > 0 ? l.lineTotal / l.quantity : 0,
      lineTotal: l.lineTotal,
      notes: l.notes,
    })),
    subtotal: Number(order.subtotal),
    deliveryFee: order.delivery_fee ? Number(order.delivery_fee) : undefined,
    discount: Number(order.discount),
    total: Number(order.total),
    // بدون paidAmount — هاي التذكرة بتتطبع لحظة إنشاء الطلب، مو وقت استلام الدفع، فمافي مبلغ مستلم حقيقي نعرضه هون
    currency: settings?.currency || CURRENCY,
  };

  return <ReceiptTemplate data={data} />;
}
