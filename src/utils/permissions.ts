import type { AppPage } from '../components/layout/AppSidebar';
import type { Role } from '../types';

/** أقصى نسبة خصم يقدر الكاشير يعطيها بدون موافقة مدير */
export const MAX_CASHIER_DISCOUNT_PERCENT = 10;

const PAGE_ACCESS: Record<Role, AppPage[]> = {
  admin: ['pos', 'tables', 'whatsapp-orders', 'orders', 'reports', 'products', 'inventory', 'modifiers', 'staff', 'customers', 'suppliers'],
  manager: ['pos', 'tables', 'whatsapp-orders', 'orders', 'reports', 'products', 'inventory', 'modifiers', 'staff', 'customers', 'suppliers'],
  cashier: ['pos', 'tables', 'whatsapp-orders', 'orders'],
  waiter: ['pos', 'tables'],
  kitchen: ['whatsapp-orders'],
};

export function canAccessPage(role: Role, page: AppPage): boolean {
  return PAGE_ACCESS[role].includes(page);
}

export function defaultPageFor(role: Role): AppPage {
  return PAGE_ACCESS[role][0];
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدير عام',
  manager: 'مديرة شفت',
  cashier: 'كاشير',
  kitchen: 'مطبخ',
  waiter: 'نادل',
};
export { ROLE_LABELS };

/** الأدوار اللي عندها صلاحية "مدير" لتجاوز القيود (خصم أكبر، إلغاء طلب مكتمل...) */
export function isManagerLevel(role: Role): boolean {
  return role === 'admin' || role === 'manager';
}

export function canApplyDiscount(role: Role, percent: number): boolean {
  if (isManagerLevel(role)) return true;
  return percent <= MAX_CASHIER_DISCOUNT_PERCENT;
}

export function canCancelCompletedOrder(role: Role): boolean {
  return isManagerLevel(role);
}

export function canOverridePayment(role: Role): boolean {
  return isManagerLevel(role);
}
