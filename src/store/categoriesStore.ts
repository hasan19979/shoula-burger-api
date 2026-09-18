import { create } from 'zustand';
import type { Category } from '../types';
import { apiRequest } from '../services/api';

interface ApiCategory {
  id: number;
  slug: string;
  name: string;
  icon: string;
  print_order: number;
}

interface CategoriesState {
  categories: Category[];
  rawCategories: ApiCategory[];
  loading: boolean;
  error: string | null;
  fetchCategories: () => Promise<void>;
  getCategoryIdBySlug: (slug: string) => number | null;
  getPrintOrderBySlug: (slug: string) => number;
}

// أيقونة عامة موحّدة — الفئات الحقيقية بقاعدة البيانات مالها أيقونات lucide-react محددة زي البيانات التجريبية
const DEFAULT_ICON = 'UtensilsCrossed';

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [{ id: 'all', name: 'الكل', icon: 'LayoutGrid' }],
  rawCategories: [],
  loading: false,
  error: null,

  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ApiCategory[]>('/categories');
      set({
        categories: [
          { id: 'all', name: 'الكل', icon: 'LayoutGrid' },
          ...data.map((c) => ({ id: c.slug, name: c.name, icon: DEFAULT_ICON, printOrder: c.print_order })),
        ],
        rawCategories: data,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل الفئات' });
    }
  },

  getCategoryIdBySlug: (slug) => {
    const found = get().rawCategories.find((c) => c.slug === slug);
    return found ? found.id : null;
  },

  // ترتيب الطباعة بالفاتورة لفئة معيّنة (بالـ slug) — 999 افتراضياً لو مش معروفة، حتى تطبع بالآخر بدون خطأ
  getPrintOrderBySlug: (slug) => {
    const found = get().rawCategories.find((c) => c.slug === slug);
    return found?.print_order ?? 999;
  },
}));
