import { create } from 'zustand';
import { apiRequest } from '../services/api';

export interface RestaurantSettings {
  restaurant_name: string;
  tagline: string;
  whatsapp_number: string;
  currency: string;
}

interface SettingsState {
  settings: RestaurantSettings | null;
  fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  fetchSettings: async () => {
    try {
      const data = await apiRequest<RestaurantSettings>('/settings');
      set({ settings: data });
    } catch {
      // صامت — لو فشل، الفاتورة بترجع تستخدم القيم الافتراضية بدل ما توقف
    }
  },
}));
