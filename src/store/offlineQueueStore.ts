import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiRequest, ApiError } from '../services/api';

export interface PendingPosOrderPayload {
  localId: string; // معرف محلي مؤقت — يُستخدم للعرض لحد ما يرجع رقم الطلب الحقيقي من السيرفر
  createdAt: string;
  body: {
    items: { productId: number; quantity: number; modifierOptionIds: number[]; includedIngredients?: string[] }[];
    paymentMethod: string;
    tableNumber?: string;
    orderType?: string;
    address?: string;
    kitchenStatus: string;
  };
}

interface OfflineQueueState {
  pending: PendingPosOrderPayload[];
  syncing: boolean;
  lastSyncError: string | null;
  addPending: (payload: PendingPosOrderPayload) => void;
  syncPending: () => Promise<void>;
}

let localIdCounter = 0;
export function generateLocalOrderId() {
  localIdCounter += 1;
  return `OFFLINE-${Date.now()}-${localIdCounter}`;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      pending: [],
      syncing: false,
      lastSyncError: null,

      addPending: (payload) => set((state) => ({ pending: [...state.pending, payload] })),

      /** بتحاول تبعت كل الطلبات المعلّقة للسيرفر بالترتيب — أي طلب ينجح بينشال من القائمة،
       * وأي طلب يفشل (لسا بدون نت) بيضل بالقائمة لمحاولة جاية */
      syncPending: async () => {
        const { pending, syncing } = get();
        if (syncing || pending.length === 0) return;

        set({ syncing: true, lastSyncError: null });
        const stillPending: PendingPosOrderPayload[] = [];

        for (const order of pending) {
          try {
            await apiRequest('/orders/pos', { method: 'POST', auth: true, body: order.body });
          } catch (err) {
            stillPending.push(order);
            if (err instanceof ApiError) {
              set({ lastSyncError: `طلب ما انبعت (${err.message}) — راجعيه يدوياً` });
            }
          }
        }

        set({ pending: stillPending, syncing: false });
      },
    }),
    { name: 'shoula-pos-offline-queue' }
  )
);
