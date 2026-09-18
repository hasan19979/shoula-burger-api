import type { Category, Order, PaymentMethod, Product } from '../types';

export type ReportRange = 'today' | 'week' | 'month' | 'all';

const RANGE_LABELS: Record<ReportRange, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوم',
  all: 'كل الفترات',
};
export { RANGE_LABELS };

export function filterOrdersByRange(orders: Order[], range: ReportRange): Order[] {
  if (range === 'all') return orders;
  const now = Date.now();
  const daysBack = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  const cutoff = now - daysBack * 24 * 60 * 60 * 1000;
  return orders.filter((o) => {
    const created = new Date(o.createdAt).getTime();
    if (range === 'today') return new Date(o.createdAt).toDateString() === new Date().toDateString();
    return created >= cutoff;
  });
}

export interface ReportSummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  totalDiscounts: number;
  cancelledCount: number;
  cancelledValue: number;
}

export function computeSummary(orders: Order[]): ReportSummary {
  const completed = orders.filter((o) => o.status === 'completed');
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const totalSales = completed.reduce((sum, o) => sum + o.total, 0);
  const totalDiscounts = completed.reduce((sum, o) => sum + o.discountAmount, 0);

  return {
    totalSales,
    orderCount: completed.length,
    averageOrderValue: completed.length ? totalSales / completed.length : 0,
    totalDiscounts,
    cancelledCount: cancelled.length,
    cancelledValue: cancelled.reduce((sum, o) => sum + o.total, 0),
  };
}

export interface ProductSalesRow {
  productName: string;
  quantity: number;
  revenue: number;
}

export function computeProductSales(orders: Order[]): ProductSalesRow[] {
  const completed = orders.filter((o) => o.status === 'completed');
  const map = new Map<string, ProductSalesRow>();

  for (const order of completed) {
    for (const item of order.items) {
      const existing = map.get(item.productName);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.lineTotal;
      } else {
        map.set(item.productName, { productName: item.productName, quantity: item.quantity, revenue: item.lineTotal });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}

export interface CategorySalesRow {
  categoryId: string;
  categoryName: string;
  revenue: number;
  quantity: number;
}

/** طلبات السيرفر بتخزن بس اسم الصنف وقت البيع (product_name)، مش فئته — فبنطابقها مع قائمة
 * المنتجات الحيّة الحالية بالاسم لنعرف فئتها. لو صنف انحذف أو تغيّر اسمه بعدين، بيندرج تحت "غير مصنّف". */
export function computeCategorySales(orders: Order[], products: Product[], categories: Category[]): CategorySalesRow[] {
  const completed = orders.filter((o) => o.status === 'completed');
  const productByName = new Map(products.map((p) => [p.name, p]));
  const categoryNameBySlug = new Map(categories.map((c) => [c.id, c.name]));
  const map = new Map<string, CategorySalesRow>();

  for (const order of completed) {
    for (const item of order.items) {
      const product = productByName.get(item.productName);
      const catId = product?.categoryId ?? 'unknown';
      const catName = categoryNameBySlug.get(catId) ?? 'غير مصنّف';
      const existing = map.get(catId);
      if (existing) {
        existing.revenue += item.lineTotal;
        existing.quantity += item.quantity;
      } else {
        map.set(catId, { categoryId: catId, categoryName: catName, revenue: item.lineTotal, quantity: item.quantity });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export function computePaymentMethodBreakdown(orders: Order[]): { method: PaymentMethod; total: number }[] {
  const completed = orders.filter((o) => o.status === 'completed');
  const map = new Map<PaymentMethod, number>();

  for (const order of completed) {
    // لو الطلب انقسم بأكتر من طريقة دفع (Split Bill)، بنوزع مبلغه بالتساوي بين الطرق المستخدمة كتقريب معقول
    const share = order.total / (order.paymentMethods.length || 1);
    for (const method of order.paymentMethods) {
      map.set(method, (map.get(method) ?? 0) + share);
    }
  }

  return Array.from(map.entries()).map(([method, total]) => ({ method, total }));
}

export interface CashierSalesRow {
  cashierName: string;
  orderCount: number;
  total: number;
}

export function computeCashierSales(orders: Order[]): CashierSalesRow[] {
  const completed = orders.filter((o) => o.status === 'completed');
  const map = new Map<string, CashierSalesRow>();

  for (const order of completed) {
    const existing = map.get(order.cashierName);
    if (existing) {
      existing.orderCount += 1;
      existing.total += order.total;
    } else {
      map.set(order.cashierName, { cashierName: order.cashierName, orderCount: 1, total: order.total });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
