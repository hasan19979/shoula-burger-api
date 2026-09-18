import { create } from 'zustand';
import type { InventoryItem, InventoryUnit, StockMovementType } from '../types';
import { apiRequest } from '../services/api';

interface ApiInventoryItem {
  id: number;
  name: string;
  unit: InventoryUnit;
  quantity: string | number;
  min_threshold: string | number;
  cost_per_unit: string | number | null;
}

function mapItem(i: ApiInventoryItem): InventoryItem {
  return {
    id: String(i.id),
    name: i.name,
    unit: i.unit,
    quantity: Number(i.quantity),
    minThreshold: Number(i.min_threshold),
    costPerUnit: i.cost_per_unit !== null ? Number(i.cost_per_unit) : undefined,
  };
}

interface InventoryState {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  addItem: (item: Omit<InventoryItem, 'id'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  adjustStock: (itemId: string, delta: number, type: StockMovementType, note?: string, supplierId?: number, unitCost?: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ApiInventoryItem[]>('/inventory', { auth: true });
      set({ items: data.map(mapItem), loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل المخزون' });
    }
  },

  addItem: async (item) => {
    await apiRequest('/inventory', {
      method: 'POST', auth: true,
      body: { name: item.name, unit: item.unit, quantity: item.quantity, min_threshold: item.minThreshold, cost_per_unit: item.costPerUnit },
    });
    await get().fetchItems();
  },

  updateItem: async (id, updates) => {
    await apiRequest(`/inventory/${id}`, {
      method: 'PUT', auth: true,
      body: { name: updates.name, unit: updates.unit, min_threshold: updates.minThreshold, cost_per_unit: updates.costPerUnit },
    });
    await get().fetchItems();
  },

  deleteItem: async (id) => {
    await apiRequest(`/inventory/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
  },

  adjustStock: async (itemId, delta, type, note, supplierId, unitCost) => {
    await apiRequest(`/inventory/${itemId}/adjust`, {
      method: 'POST', auth: true,
      body: { delta, type, note, supplierId, unitCost },
    });
    await get().fetchItems();
  },
}));

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity <= item.minThreshold;
}
