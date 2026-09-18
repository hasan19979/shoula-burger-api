import type { Order } from '../../types';
import { CURRENCY } from '../../data/demoData';
import { useSettingsStore } from '../../store/settingsStore';
import { groupAndSortForPrint, type PrintableLine } from '../../utils/printOrder';
import ReceiptTemplate from '../receipt/ReceiptTemplate';
import type { ReceiptData } from '../../types/receipt';

interface Props {
  order: Order;
}

/** فاتورة/تذكرة مطبخ لطلب واتساب/الموقع — طباعتها هي إشارة "الطلب تحوّل للمطبخ يدوياً"،
 * بما إنه المطبخ ما عندو شاشة ولا طابعة خاصة فيه. نفس تصميم الفاتورة الموحّد بكل مكان بالنظام. */
export default function WhatsAppOrderTicket({ order }: Props) {
  const settings = useSettingsStore((s) => s.settings);

  const printableLines: PrintableLine[] = order.items.map((item) => ({
    productKey: item.productName, // ما عنّا product_id هون بس الاسم كافي للتجميع بهالسياق
    productName: item.productName,
    quantity: item.quantity,
    notes: [...item.includedIngredients, ...(item.notes ? [item.notes] : [])],
    printOrder: item.printOrder,
    lineTotal: item.lineTotal,
  }));
  const sortedLines = groupAndSortForPrint(printableLines);

  const data: ReceiptData = {
    restaurantName: settings?.restaurant_name || 'شعلة برجر',
    tagline: settings?.tagline || undefined,
    restaurantPhone: settings?.whatsapp_number || undefined,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    createdAt: order.createdAt,
    tableNumber: order.tableNumber,
    customer: order.orderType === 'delivery' ? { name: order.customerName, phone: order.customerPhone && order.customerPhone !== '-' ? order.customerPhone : undefined, address: order.address } : undefined,
    items: sortedLines.map((l) => ({
      productKey: l.productKey,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.quantity > 0 ? l.lineTotal / l.quantity : 0,
      lineTotal: l.lineTotal,
      notes: l.notes,
    })),
    subtotal: order.subtotal,
    discount: order.discountAmount,
    total: order.total,
    currency: settings?.currency || CURRENCY,
  };

  return <ReceiptTemplate data={data} />;
}
