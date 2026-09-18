import { create } from 'zustand';
import type { CartItem, OrderType, SelectedModifier } from '../types';

interface AddItemPayload {
  product: CartItem['product'];
  quantity: number;
  selectedModifiers: SelectedModifier[];
  removedIngredients: string[];
  notes?: string;
}

interface UpdateItemDetailsPayload {
  selectedModifiers: SelectedModifier[];
  removedIngredients: string[];
  notes?: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  orderType: OrderType;
  tableNumber: string | null;
  customerPhone: string;
  customerName: string;
  deliveryAddress: string;

  addItem: (payload: AddItemPayload) => void;
  updateItemDetails: (lineId: string, payload: UpdateItemDetailsPayload) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  updateNotes: (lineId: string, notes: string) => void;
  clearCart: () => void;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (table: string | null) => void;
  setCustomerPhone: (phone: string) => void;
  setCustomerName: (name: string) => void;
  setDeliveryAddress: (address: string) => void;
}

let lineCounter = 0;
function generateLineId() {
  lineCounter += 1;
  return `line-${Date.now()}-${lineCounter}`;
}

/** بتقارن مجموعتين من التعديلات — بتتجاهل الترتيب، بتقارن بس أي خيار مُختار من أي مجموعة */
function sameModifiers(a: SelectedModifier[], b: SelectedModifier[]): boolean {
  if (a.length !== b.length) return false;
  const key = (m: SelectedModifier) => `${m.groupId}:${m.optionId}`;
  const setA = new Set(a.map(key));
  return b.every((m) => setA.has(key(m)));
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  orderType: 'dine-in',
  tableNumber: null,
  customerPhone: '',
  customerName: '',
  deliveryAddress: '',

  addItem: (payload) =>
    set((state) => {
      // لو نفس الصنف بنفس التخصيص بالضبط (نفس التعديلات ونفس الملاحظة) موجود أصلاً بالسلة،
      // زيدي على كميته بدل ما تعملي سطر مكرر — هيك ٣ ضغطات على "بطاطا" بتصير سطر وحد بكمية ٣
      const existing = state.items.find(
        (i) =>
          i.product.id === payload.product.id &&
          sameModifiers(i.selectedModifiers, payload.selectedModifiers) &&
          (i.notes || '') === (payload.notes || '')
      );

      if (existing) {
        return {
          items: state.items.map((i) => (i.lineId === existing.lineId ? { ...i, quantity: i.quantity + payload.quantity } : i)),
        };
      }

      return {
        items: [
          ...state.items,
          {
            lineId: generateLineId(),
            product: payload.product,
            quantity: payload.quantity,
            selectedModifiers: payload.selectedModifiers,
            removedIngredients: payload.removedIngredients,
            notes: payload.notes,
          },
        ],
      };
    }),

  /** بتستبدل تفاصيل سطر موجود بالكامل — تُستخدم لما الكاشير يرجع يعدّل صنف مضاف أصلاً بالسلة */
  updateItemDetails: (lineId, payload) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.lineId === lineId
          ? {
              ...i,
              quantity: payload.quantity,
              selectedModifiers: payload.selectedModifiers,
              removedIngredients: payload.removedIngredients,
              notes: payload.notes,
            }
          : i
      ),
    })),

  updateQuantity: (lineId, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((i) => i.lineId !== lineId)
          : state.items.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)),
    })),

  removeItem: (lineId) =>
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

  updateNotes: (lineId, notes) =>
    set((state) => ({
      items: state.items.map((i) => (i.lineId === lineId ? { ...i, notes } : i)),
    })),

  clearCart: () => set({ items: [], tableNumber: null, customerPhone: '', customerName: '', deliveryAddress: '' }),

  setOrderType: (orderType) => set({ orderType }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  setCustomerPhone: (customerPhone) => set({ customerPhone }),
  setCustomerName: (customerName) => set({ customerName }),
  setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
}));
