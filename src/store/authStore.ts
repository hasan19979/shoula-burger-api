import { create } from 'zustand';
import type { StaffUser } from '../types';
import { apiRequest, setAuthToken } from '../services/api';

interface AuthState {
  currentUser: StaffUser | null;
  loading: boolean;
  error: string | null;
  loginWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  loading: false,
  error: null,

  loginWithPin: async (pin) => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<{ token: string; staff: { id: number; name: string; role: string } }>(
        '/staff/login',
        { method: 'POST', body: { pin } }
      );
      setAuthToken(data.token);
      set({
        currentUser: { id: String(data.staff.id), name: data.staff.name, role: data.staff.role as StaffUser['role'], pin: '' },
        loading: false,
      });
      return true;
    } catch (err) {
      setAuthToken(null);
      set({ loading: false, error: err instanceof Error ? err.message : 'صار خطأ' });
      return false;
    }
  },

  logout: () => {
    setAuthToken(null);
    set({ currentUser: null });
  },
}));
