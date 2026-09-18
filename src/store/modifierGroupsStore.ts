import { create } from 'zustand';
import type { ModifierGroup, ModifierOption } from '../types';
import { apiRequest } from '../services/api';

interface ApiOption { id: number; name: string; price: string | number; default_included: boolean; }
interface ApiGroup { id: number; name: string; selection_type: 'single' | 'multiple'; required: boolean; min_select: number; max_select: number; options: ApiOption[]; }

function mapGroup(g: ApiGroup): ModifierGroup {
  return {
    id: String(g.id),
    name: g.name,
    selectionType: g.selection_type,
    required: g.required,
    min: g.min_select,
    max: g.max_select,
    options: g.options.map((o): ModifierOption => ({
      id: String(o.id),
      name: o.name,
      price: Number(o.price),
      defaultIncluded: o.default_included,
    })),
  };
}

interface ModifierGroupsState {
  groups: ModifierGroup[];
  loading: boolean;
  error: string | null;
  fetchGroups: () => Promise<void>;
  addGroup: (group: Omit<ModifierGroup, 'id' | 'options'>) => Promise<string>;
  updateGroup: (id: string, updates: Partial<Omit<ModifierGroup, 'id' | 'options'>>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  addOption: (groupId: string, option: Omit<ModifierOption, 'id'>) => Promise<void>;
  updateOption: (groupId: string, optionId: string, updates: Partial<ModifierOption>) => Promise<void>;
  deleteOption: (groupId: string, optionId: string) => Promise<void>;
  /** بتسجّل مجموعة "مصطنعة" محلياً بالمتصفح بس (مو محفوظة بقاعدة البيانات) — تُستخدم لتحويل
   * مكونات النظام القديم (product_ingredients) لتخصيص شغال بالكاشير تلقائياً بدون تكرار الإدخال */
  registerSyntheticGroup: (group: ModifierGroup) => void;
}

export const useModifierGroupsStore = create<ModifierGroupsState>((set, get) => ({
  groups: [],
  loading: false,
  error: null,

  fetchGroups: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ApiGroup[]>('/modifiers');
      set((state) => ({
        // بنحافظ على أي مجموعة "مصطنعة" (legacy-*) مسجّلة أصلاً من fetchProducts — لأنه الطلبين
        // بيشتغلوا بنفس الوقت بدون ترتيب مضمون، وكنا نمسحها بالغلط لو خلص هاد الطلب بعدها
        groups: [...data.map(mapGroup), ...state.groups.filter((g) => g.id.startsWith('legacy-'))],
        loading: false,
      }));
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل مجموعات التعديلات' });
    }
  },

  addGroup: async (group) => {
    const created = await apiRequest<ApiGroup>('/modifiers', {
      method: 'POST',
      auth: true,
      body: { name: group.name, selection_type: group.selectionType, required: group.required, min_select: group.min, max_select: group.max },
    });
    set((state) => ({ groups: [...state.groups, mapGroup(created)] }));
    return String(created.id);
  },

  updateGroup: async (id, updates) => {
    await apiRequest(`/modifiers/${id}`, {
      method: 'PUT',
      auth: true,
      body: {
        name: updates.name,
        selection_type: updates.selectionType,
        required: updates.required,
        min_select: updates.min,
        max_select: updates.max,
      },
    });
    await get().fetchGroups();
  },

  deleteGroup: async (id) => {
    await apiRequest(`/modifiers/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ groups: state.groups.filter((g) => g.id !== id) }));
  },

  addOption: async (groupId, option) => {
    await apiRequest(`/modifiers/${groupId}/options`, {
      method: 'POST',
      auth: true,
      body: { name: option.name, price: option.price, default_included: option.defaultIncluded },
    });
    await get().fetchGroups();
  },

  updateOption: async (groupId, optionId, updates) => {
    await apiRequest(`/modifiers/options/${optionId}`, {
      method: 'PUT',
      auth: true,
      body: { name: updates.name, price: updates.price, default_included: updates.defaultIncluded },
    });
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...updates } : o)) } : g
      ),
    }));
  },

  deleteOption: async (groupId, optionId) => {
    await apiRequest(`/modifiers/options/${optionId}`, { method: 'DELETE', auth: true });
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, options: g.options.filter((o) => o.id !== optionId) } : g)),
    }));
  },

  registerSyntheticGroup: (group) =>
    set((state) => ({
      groups: state.groups.some((g) => g.id === group.id)
        ? state.groups.map((g) => (g.id === group.id ? group : g))
        : [...state.groups, group],
    })),
}));
