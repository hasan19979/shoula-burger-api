export interface ReceiptItemLine {
  productKey: string | number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** الفرق عن الوضع الافتراضي بس (زي "بدون بصل")، مش قائمة المكوّنات الكاملة */
  notes: string[];
}

export interface ReceiptCustomerInfo {
  name?: string;
  phone?: string;
  address?: string;
}

export type ReceiptOrderType = 'dine-in' | 'takeaway' | 'delivery' | 'pickup';

export interface ReceiptData {
  restaurantName: string;
  tagline?: string;
  restaurantPhone?: string;
  orderNumber: string;
  orderType: ReceiptOrderType;
  createdAt: string;
  tableNumber?: string | null;
  customer?: ReceiptCustomerInfo;
  items: ReceiptItemLine[];
  subtotal: number;
  deliveryFee?: number;
  discount?: number;
  total: number;
  /** المبلغ المدفوع — لو مش معروف (تذكرة مطبخ لطلب لسا ما انسدد)، منخفي قسم الدفع كامل بدل ما نطبع صفر مضلّل */
  paidAmount?: number;
  currency: string;
}
