// ============================================================
// أنواع بيانات نظام الكاشير (POS) — شعلة برجر
// ============================================================

export type ModifierSelectionType = 'single' | 'multiple';

/** خيار واحد جوا مجموعة تعديلات (مثلاً "خس" أو "بيكون +4₪") */
export interface ModifierOption {
  id: string;
  name: string;
  /** السعر الإضافي لهاد الخيار (0 لو مجاني، زي مكونات الأساس القابلة للإزالة) */
  price: number;
  /** هل الخيار مفعّل افتراضياً وقت فتح شاشة التخصيص (مثلاً مكونات البرجر الأساسية) */
  defaultIncluded?: boolean;
}

/** مجموعة تعديلات مستقلة، قابلة للربط بأي منتج (مثال: "مكونات البرجر"، "الإضافات") */
export interface ModifierGroup {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
}

export interface Category {
  id: string;
  name: string;
  icon: string; // اسم أيقونة من lucide-react
  printOrder?: number; // ترتيب الطباعة بالفاتورة — منفصل عن ترتيب العرض بالمنيو
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  /** تكلفة المنتج (اختياري) — يستخدم لحساب الربح ونسبة الهامش */
  cost?: number;
  categoryId: string;
  image?: string;
  available: boolean;
  /** مجموعات التعديلات المرتبطة بهاد المنتج (مكونات، إضافات، حجم، إلخ) */
  modifierGroupIds: string[];
  sku?: string;
  barcode?: string;
  /** الوصفة — المواد الخام اللي بتنخصم تلقائياً من المخزون عند بيع وحدة من هاد المنتج */
  recipe?: RecipeIngredient[];
}

/** خيار انتقاه الزبون فعلياً جوا مجموعة تعديلات معينة، بسياق صنف بالسلة */
export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export type OrderType = 'dine-in' | 'takeaway' | 'delivery' | 'pickup';

export interface CartItem {
  /** معرف فريد لهاد السطر بالسلة (مو نفس معرف المنتج، لأنه ممكن يتكرر المنتج بتخصيصات مختلفة) */
  lineId: string;
  product: Product;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  /** أسماء المكونات الأساسية اللي كانت مفعّلة افتراضياً وشالها الزبون (مثلاً "بدون بصل") */
  removedIngredients: string[];
  notes?: string;
  /** الشخص المرتبط بهاد الصنف وقت تقسيم الفاتورة (يُستخدم لاحقاً بميزة Split Bill) */
  assignedPersonId?: string;
}

export interface CartItemPriceBreakdown {
  basePrice: number;
  modifiersTotal: number;
  unitPrice: number;
  lineTotal: number;
}

// ============================================================
// الدفع وتقسيم الفاتورة
// ============================================================

export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'bank-transfer' | 'other';

export type DiscountType = 'percent' | 'fixed';

export interface Discount {
  type: DiscountType;
  value: number;
}

export type SplitMethod = 'by-person' | 'by-item' | 'manual';

export type PersonPaymentStatus = 'unpaid' | 'partial' | 'paid';

/** جزء من صنف بالسلة مُسنَد لشخص معيّن وقت تقسيم الفاتورة حسب الأشخاص/الأصناف */
export interface ItemAssignment {
  lineId: string;
  personId: string;
  /** الكمية من هاد الصنف المُسنَدة لهاد الشخص (يسمح بتقسيم صنف واحد على أكتر من شخص) */
  quantity: number;
}

export interface SplitPayment {
  method: PaymentMethod;
  amount: number;
}

export interface Person {
  id: string;
  label: string;
  /** يُستخدم بس بالتقسيم اليدوي — المبلغ المخصص لهاد الشخص مباشرة بدون ربط بأصناف معينة */
  manualAmount?: number;
  payments: SplitPayment[];
}

export interface CompletedPayment {
  orderNumber: string;
  subtotal: number;
  discount: Discount | null;
  discountAmount: number;
  total: number;
  amountPaid: number;
  changeDue: number;
  primaryMethod: PaymentMethod;
  completedAt: string;
}

// ============================================================
// المخزون والوصفات
// ============================================================

export type InventoryUnit = 'g' | 'kg' | 'ml' | 'l' | 'piece';

export interface InventoryItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  quantity: number;
  minThreshold: number;
  costPerUnit?: number;
}

/** مكوّن وصفة — كمية من مادة خام محددة تُستهلك عند بيع وحدة واحدة من المنتج */
export interface RecipeIngredient {
  inventoryItemId: string;
  quantity: number;
}

export type StockMovementType = 'purchase' | 'sale-deduction' | 'waste' | 'adjustment';

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  type: StockMovementType;
  quantity: number; // موجب = زيادة، سالب = نقصان
  note?: string;
  createdAt: string;
}

// ============================================================
// المستخدمون والصلاحيات
// ============================================================

export type Role = 'admin' | 'manager' | 'cashier' | 'kitchen' | 'waiter';

export interface StaffUser {
  id: string;
  name: string;
  role: Role;
  pin: string;
}

// ============================================================
// إدارة الطاولات
// ============================================================

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'needs-cleaning';

export interface RestaurantTable {
  id: string;
  number: string;
  seats: number;
  status: TableStatus;
  partySize?: number;
  openedAt?: string;
  cashierName?: string;
}

// ============================================================
// الطلبات (Orders)
// ============================================================

export type OrderStatus = 'open' | 'completed' | 'cancelled' | 'pending';

/** حالة تحضير الطلب بالمطبخ — مستقلة عن حالة الدفع (OrderStatus) */
export type KitchenStatus = 'new' | 'preparing' | 'ready' | 'served';

/** صنف بطلب مسجّل بالسيرفر أصلاً — أبسط من CartItem الحيّة بالسلة، لأنه الموقع (الطلبات القديمة/الحالية)
 * بيخزّن "المكونات المتضمّنة" كقائمة أسماء بسيطة، مش تعديلات مُهيكلة بأسعار زي نظام الكاشير */
export interface OrderLineItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  includedIngredients: string[];
  notes?: string;
  printOrder: number; // ترتيب الطباعة حسب فئة الصنف — لترتيب الفاتورة وقت الطباعة بس
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  tableNumber: string | null;
  items: OrderLineItem[];
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  paymentMethods: PaymentMethod[];
  status: OrderStatus;
  kitchenStatus: KitchenStatus;
  cashierName: string;
  customerName: string;
  customerPhone: string;
  address: string;
  createdAt: string;
  orderSource: 'online' | 'pos';
  /** بند 23: تسجيل الإلغاء/الاسترجاع — مين عمل العملية، الوقت، السبب */
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  refundAmount?: number;
}
