import { create } from 'zustand';
import { apiRequest } from '../services/api';

export interface SupplierRecord {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  notes: string;
  purchase_count: string | number;
  total_spent: string | number;
  created_at: string;
}

export interface PurchaseRecord {
  id: number;
  item_name: string;
  unit: string;
  quantity: string | number;
  unit_cost: string | number | null;
  created_at: string;
}

interface SuppliersState {
  suppliers: SupplierRecord[];
  loading: boolean;
  error: string | null;
  fetchSuppliers: () => Promise<void>;
  addSupplier: (payload: { name: string; contactPerson?: string; phone?: string; notes?: string }) => Promise<void>;
  updateSupplier: (id: number, payload: { name?: string; contactPerson?: string; phone?: string; notes?: string }) => Promise<void>;
  deleteSupplier: (id: number) => Promise<void>;
  fetchPurchases: (supplierId: number) => Promise<PurchaseRecord[]>;
}

export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: [],
  loading: false,
  error: null,

  fetchSuppliers: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<SupplierRecord[]>('/suppliers', { auth: true });
      set({ suppliers: data, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل قائمة الموردين' });
    }
  },

  addSupplier: async (payload) => {
    await apiRequest('/suppliers', { method: 'POST', auth: true, body: payload });
    await get().fetchSuppliers();
  },

  updateSupplier: async (id, payload) => {
    await apiRequest(`/suppliers/${id}`, { method: 'PUT', auth: true, body: payload });
    await get().fetchSuppliers();
  },

  deleteSupplier: async (id) => {
    await apiRequest(`/suppliers/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ suppliers: state.suppliers.filter((s) => s.id !== id) }));
  },

  fetchPurchases: async (supplierId) => {
    try {
      return await apiRequest<PurchaseRecord[]>(`/suppliers/${supplierId}/purchases`, { auth: true });
    } catch {
      return [];
    }
  },
}));
