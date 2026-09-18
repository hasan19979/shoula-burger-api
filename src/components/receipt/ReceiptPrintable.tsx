import type { CartItem, CompletedPayment, OrderType } from '../../types';
import { CURRENCY } from '../../data/demoData';
import { describeModifiers } from '../../utils/calculations';
import { useCategoriesStore } from '../../store/categoriesStore';
import { useSettingsStore } from '../../store/settingsStore';
import { groupAndSortForPrint, type PrintableLine } from '../../utils/printOrder';
import ReceiptTemplate from './ReceiptTemplate';
import type { ReceiptData } from '../../types/receipt';

interface Props {
  payment: CompletedPayment;
  items: CartItem[];
  orderType: OrderType;
  tableNumber: string | null;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
}

/**
 * الفاتورة الحرارية — مخفية بالشاشة العادية، وبتظهر بس وقت الطباعة (window.print).
 * التصميم والترتيب موحّدين بكل قوالب الطباعة بالنظام عبر ReceiptTemplate.
 */
export default function ReceiptPrintable({
  payment, items, orderType, tableNumber, customerName, customerPhone, deliveryAddress,
}: Props) {
  const getPrintOrderBySlug = useCategoriesStore((s) => s.getPrintOrderBySlug);
  const settings = useSettingsStore((s) => s.settings);

  const printableLines: PrintableLine[] = items.map((item) => {
    const { extras, removedBase } = describeModifiers(item);
    const notes = [...extras, ...removedBase.map((n) => `بدون ${n}`), ...(item.notes ? [item.notes] : [])];
    const unitPrice = item.product.price + item.selectedModifiers.reduce((s, m) => s + m.price, 0);
    return {
      productKey: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      notes,
      printOrder: getPrintOrderBySlug(item.product.categoryId),
      lineTotal: unitPrice * item.quantity,
    };
  });
  const sortedLines = groupAndSortForPrint(printableLines);

  const data: ReceiptData = {
    restaurantName: settings?.restaurant_name || 'شعلة برجر',
    tagline: settings?.tagline || undefined,
    restaurantPhone: settings?.whatsapp_number || undefined,
    orderNumber: payment.orderNumber,
    orderType,
    createdAt: payment.completedAt,
    tableNumber,
    customer: orderType === 'delivery' ? { name: customerName, phone: customerPhone, address: deliveryAddress } : undefined,
    items: sortedLines.map((l) => ({
      productKey: l.productKey,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.quantity > 0 ? l.lineTotal / l.quantity : 0,
      lineTotal: l.lineTotal,
      notes: l.notes,
    })),
    subtotal: payment.subtotal,
    discount: payment.discountAmount,
    total: payment.total,
    paidAmount: payment.amountPaid,
    currency: settings?.currency || CURRENCY,
  };

  return <ReceiptTemplate data={data} />;
}
