import { ShoppingCart, LayoutGrid as TablesIcon, ClipboardList, Package, BarChart3, Settings, MessageCircle, Boxes, Layers, Users, UserCircle2, Truck } from 'lucide-react';

export type AppPage = 'pos' | 'orders' | 'tables' | 'whatsapp-orders' | 'reports' | 'products' | 'inventory' | 'modifiers' | 'staff' | 'customers' | 'suppliers';

export interface NavItem {
  id: AppPage | 'settings';
  label: string;
  icon: React.ElementType;
  buildable: boolean; // مبنية فعلياً (مو placeholder)
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'pos', label: 'الكاشير', icon: ShoppingCart, buildable: true },
  { id: 'tables', label: 'الطاولات', icon: TablesIcon, buildable: true },
  { id: 'whatsapp-orders', label: 'طلبات واتساب', icon: MessageCircle, buildable: true },
  { id: 'orders', label: 'الطلبات', icon: ClipboardList, buildable: true },
  { id: 'reports', label: 'التقارير', icon: BarChart3, buildable: true },
  { id: 'products', label: 'المنتجات', icon: Package, buildable: true },
  { id: 'modifiers', label: 'التعديلات', icon: Layers, buildable: true },
  { id: 'inventory', label: 'المخزون', icon: Boxes, buildable: true },
  { id: 'suppliers', label: 'الموردون', icon: Truck, buildable: true },
  { id: 'customers', label: 'العملاء', icon: UserCircle2, buildable: true },
  { id: 'staff', label: 'الموظفون', icon: Users, buildable: true },
  { id: 'settings', label: 'الإعدادات', icon: Settings, buildable: false },
];

/** أهم 4 شاشات لأي دور (بترتيب أولويتها بـ NAV_ITEMS) — بتظهر مباشرة بالشريط السفلي بالموبايل،
 * والباقي بيروح تحت "المزيد" */
export const MOBILE_PRIMARY_COUNT = 4;
