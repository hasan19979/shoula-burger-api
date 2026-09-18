import type { CartItem, CartItemPriceBreakdown, Discount } from '../types';

/** بتحسب سعر صنف واحد بالسلة (السعر الأساسي + كل التعديلات المدفوعة) × الكمية */
export function calculateCartItemPrice(item: CartItem): CartItemPriceBreakdown {
  const basePrice = item.product.price;
  const modifiersTotal = item.selectedModifiers.reduce((sum, m) => sum + m.price, 0);
  const unitPrice = basePrice + modifiersTotal;
  const lineTotal = unitPrice * item.quantity;
  return { basePrice, modifiersTotal, unitPrice, lineTotal };
}

export function calculateCartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateCartItemPrice(item).lineTotal, 0);
}

export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function calculateDiscountAmount(subtotal: number, discount: Discount | null): number {
  if (!discount || discount.value <= 0) return 0;
  const amount = discount.type === 'percent' ? subtotal * (discount.value / 100) : discount.value;
  return Math.min(amount, subtotal);
}

/** أرقام "أزرار سريعة" منطقية للمبلغ المستلم كاش، بناءً على الإجمالي المطلوب */
export function suggestQuickAmounts(total: number): number[] {
  const rounded = Math.ceil(total);
  const steps = [rounded, roundUpTo(total, 10), roundUpTo(total, 20), roundUpTo(total, 50), roundUpTo(total, 100)];
  return Array.from(new Set(steps.filter((n) => n >= total))).slice(0, 5).sort((a, b) => a - b);
}

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function generateOrderNumber(): string {
  return '#' + Math.floor(1000 + Math.random() * 9000);
}

// ============================================================
// تقسيم الفاتورة (Split Bill)
// ============================================================

export function getAssignedQuantity(lineId: string, assignments: import('../types').ItemAssignment[]): number {
  return assignments.filter((a) => a.lineId === lineId).reduce((sum, a) => sum + a.quantity, 0);
}

export function calculatePersonAssignedSubtotal(
  personId: string,
  items: CartItem[],
  assignments: import('../types').ItemAssignment[]
): number {
  let total = 0;
  for (const item of items) {
    const { unitPrice } = calculateCartItemPrice(item);
    const qty = assignments
      .filter((a) => a.lineId === item.lineId && a.personId === personId)
      .reduce((sum, a) => sum + a.quantity, 0);
    total += unitPrice * qty;
  }
  return total;
}

export function sumPersonPayments(person: import('../types').Person): number {
  return person.payments.reduce((sum, p) => sum + p.amount, 0);
}

/** بتولّد وصف مختصر للتعديلات المطبّقة على صنف (يستخدم بعرض السلة والفاتورة) */
export function describeModifiers(item: CartItem): { extras: string[]; removedBase: string[] } {
  const extras = item.selectedModifiers.filter((m) => m.price > 0).map((m) => `${m.optionName} +${m.price}`);
  return { extras, removedBase: item.removedIngredients };
}
