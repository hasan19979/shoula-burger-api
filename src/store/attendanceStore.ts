import { create } from 'zustand';
import { apiRequest } from '../services/api';

export interface TimeEntry {
  id: number;
  staff_id: number;
  staff_name: string;
  hourly_rate: string | number | null;
  clock_in: string;
  clock_out: string | null;
}

interface AttendanceState {
  clockedIn: boolean;
  currentEntry: TimeEntry | null;
  entries: TimeEntry[];
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  clockIn: () => Promise<void>;
  clockOut: () => Promise<void>;
  fetchEntries: (params?: { from?: string; to?: string }) => Promise<void>;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  clockedIn: false,
  currentEntry: null,
  entries: [],
  loading: false,
  error: null,

  fetchStatus: async () => {
    try {
      const data = await apiRequest<{ clockedIn: boolean; entry: TimeEntry | null }>('/attendance/status', { auth: true });
      set({ clockedIn: data.clockedIn, currentEntry: data.entry });
    } catch {
      // صامت — الحالة مش حرجة، بتترجع بالمحاولة الجاية
    }
  },

  clockIn: async () => {
    await apiRequest('/attendance/clock-in', { method: 'POST', auth: true });
    await get().fetchStatus();
  },

  clockOut: async () => {
    await apiRequest('/attendance/clock-out', { method: 'POST', auth: true });
    await get().fetchStatus();
  },

  fetchEntries: async (params) => {
    set({ loading: true, error: null });
    try {
      const query = new URLSearchParams();
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      const qs = query.toString();
      const data = await apiRequest<TimeEntry[]>(`/attendance${qs ? '?' + qs : ''}`, { auth: true });
      set({ entries: data, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل سجل الحضور' });
    }
  },
}));
