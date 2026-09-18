import { create } from 'zustand';
import type { Role } from '../types';
import { apiRequest } from '../services/api';

export interface StaffRecord {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  hourly_rate: string | number | null;
  created_at: string;
}

interface StaffState {
  staff: StaffRecord[];
  loading: boolean;
  error: string | null;
  fetchStaff: () => Promise<void>;
  addStaff: (payload: { name: string; role: Role; pin: string; hourlyRate?: number | null }) => Promise<void>;
  updateStaff: (id: number, payload: { name?: string; role?: Role; active?: boolean; pin?: string; hourlyRate?: number | null }) => Promise<void>;
  deleteStaff: (id: number) => Promise<void>;
}

export const useStaffStore = create<StaffState>((set, get) => ({
  staff: [],
  loading: false,
  error: null,

  fetchStaff: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<StaffRecord[]>('/staff', { auth: true });
      set({ staff: data, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل قائمة الموظفين' });
    }
  },

  addStaff: async (payload) => {
    await apiRequest('/staff', { method: 'POST', auth: true, body: payload });
    await get().fetchStaff();
  },

  updateStaff: async (id, payload) => {
    await apiRequest(`/staff/${id}`, { method: 'PUT', auth: true, body: payload });
    await get().fetchStaff();
  },

  deleteStaff: async (id) => {
    await apiRequest(`/staff/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ staff: state.staff.filter((s) => s.id !== id) }));
  },
}));
