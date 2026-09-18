import { create } from 'zustand';
import { apiRequest } from '../services/api';

export interface CustomerRecord {
  id: number;
  name: string;
  phone: string;
  address: string;
  loyalty_points: number;
  order_count: string | number;
  total_spent: string | number;
  last_order_at: string | null;
  created_at: string;
}

export interface FavoriteItem {
  product_name: string;
  total_quantity: string | number;
}

export interface LoyaltyLookup {
  name: string;
  phone: string;
  loyalty_points: number;
}

export interface AddressHistory {
  name: string | null;
  addresses: string[];
}

interface CustomersState {
  customers: CustomerRecord[];
  loading: boolean;
  error: string | null;
  fetchCustomers: () => Promise<void>;
  fetchFavoriteItems: (customerId: number) => Promise<FavoriteItem[]>;
  lookupByPhone: (phone: string) => Promise<LoyaltyLookup | null>;
  fetchAddressHistory: (phone: string) => Promise<AddressHistory>;
}

export const useCustomersStore = create<CustomersState>((set) => ({
  customers: [],
  loading: false,
  error: null,

  fetchCustomers: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<CustomerRecord[]>('/customers', { auth: true });
      set({ customers: data, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل قائمة العملاء' });
    }
  },

  fetchFavoriteItems: async (customerId) => {
    try {
      return await apiRequest<FavoriteItem[]>(`/customers/${customerId}/favorite-items`, { auth: true });
    } catch {
      return [];
    }
  },

  lookupByPhone: async (phone) => {
    try {
      return await apiRequest<LoyaltyLookup | null>(`/customers/lookup?phone=${encodeURIComponent(phone)}`, { auth: true });
    } catch {
      return null;
    }
  },

  fetchAddressHistory: async (phone) => {
    try {
      return await apiRequest<AddressHistory>(`/customers/address-history?phone=${encodeURIComponent(phone)}`);
    } catch {
      return { name: null, addresses: [] };
    }
  },
}));
