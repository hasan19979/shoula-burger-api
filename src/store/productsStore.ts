import { create } from 'zustand';
import type { ModifierGroup, Product } from '../types';
import { apiRequest } from '../services/api';
import { useCategoriesStore } from './categoriesStore';
import { useModifierGroupsStore } from './modifierGroupsStore';

interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: string | number;
  cost: string | number | null;
  category_slug: string;
  image_url: string;
  in_stock: boolean;
  sku: string | null;
  barcode: string | null;
  modifier_group_ids: number[];
  recipe: { inventoryItemId: number; quantity: number }[];
  ingredients: string[]; // النظام القديم (product_ingredients) — يُستخدم بموقع المنيو
}

/** بتبني مجموعة تعديلات "مصطنعة" من قائمة مكونات المنتج القديمة (product_ingredients)،
 * حتى تشتغل شاشة تخصيص الكاشير مباشرة بدون ما تحتاجي تعيدي إدخال نفس المكونات من جديد بشاشة "التعديلات" */
function buildSyntheticGroup(product: ApiProduct): ModifierGroup {
  return {
    id: `legacy-${product.id}`,
    name: 'المكونات',
    selectionType: 'multiple',
    required: false,
    min: 0,
    max: product.ingredients.length,
    options: product.ingredients.map((name, i) => ({
      id: `legacy-${product.id}-${i}`,
      name,
      price: 0,
      defaultIncluded: true,
    })),
  };
}

function mapProduct(p: ApiProduct): Product {
  const hasRealGroups = (p.modifier_group_ids || []).length > 0;
  const hasLegacyIngredients = (p.ingredients || []).length > 0;

  let modifierGroupIds = (p.modifier_group_ids || []).map(String);
  if (!hasRealGroups && hasLegacyIngredients) {
    const synthetic = buildSyntheticGroup(p);
    useModifierGroupsStore.getState().registerSyntheticGroup(synthetic);
    modifierGroupIds = [synthetic.id];
  }

  return {
    id: String(p.id),
    name: p.name,
    description: p.description || undefined,
    price: Number(p.price),
    cost: p.cost !== null ? Number(p.cost) : undefined,
    categoryId: p.category_slug,
    image: p.image_url || undefined,
    available: p.in_stock,
    modifierGroupIds,
    sku: p.sku || undefined,
    barcode: p.barcode || undefined,
    recipe: (p.recipe || []).map((r) => ({ inventoryItemId: String(r.inventoryItemId), quantity: r.quantity })),
  };
}

interface ProductsState {
  products: Product[];
  loading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleAvailability: (id: string) => Promise<void>;
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  loading: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ApiProduct[]>('/products');
      set({ products: data.map(mapProduct), loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'تعذّر تحميل المنتجات' });
    }
  },

  addProduct: async (product) => {
    const categoryId = useCategoriesStore.getState().getCategoryIdBySlug(product.categoryId);
    if (!categoryId) throw new Error('فئة غير معروفة');
    const created = await apiRequest<{ id: number }>('/products', {
      method: 'POST',
      auth: true,
      body: {
        category_id: categoryId,
        name: product.name,
        description: product.description || '',
        price: product.price,
        cost: product.cost,
        image_url: product.image || '',
        in_stock: product.available,
        sku: product.sku,
        barcode: product.barcode,
      },
    });
    if (product.modifierGroupIds.length) {
      const realGroupIds = product.modifierGroupIds.filter((gId) => /^\d+$/.test(gId));
      if (realGroupIds.length) {
        await apiRequest(`/products/${created.id}/modifier-groups`, {
          method: 'PUT', auth: true, body: { groupIds: realGroupIds.map(Number) },
        });
      }
    }
    if (product.recipe?.length) {
      await apiRequest(`/products/${created.id}/recipe`, {
        method: 'PUT', auth: true,
        body: { ingredients: product.recipe.map((r) => ({ inventoryItemId: Number(r.inventoryItemId), quantity: r.quantity })) },
      });
    }
    await get().fetchProducts();
  },

  updateProduct: async (id, updates) => {
    const body: Record<string, unknown> = {
      name: updates.name, description: updates.description, price: updates.price, cost: updates.cost,
      image_url: updates.image, in_stock: updates.available, sku: updates.sku, barcode: updates.barcode,
    };
    if (updates.categoryId) {
      const categoryId = useCategoriesStore.getState().getCategoryIdBySlug(updates.categoryId);
      if (categoryId) body.category_id = categoryId;
    }
    await apiRequest(`/products/${id}`, { method: 'PUT', auth: true, body });

    if (updates.modifierGroupIds) {
      const realGroupIds = updates.modifierGroupIds.filter((gId) => /^\d+$/.test(gId));
      await apiRequest(`/products/${id}/modifier-groups`, {
        method: 'PUT', auth: true, body: { groupIds: realGroupIds.map(Number) },
      });
    }
    if (updates.recipe) {
      await apiRequest(`/products/${id}/recipe`, {
        method: 'PUT', auth: true,
        body: { ingredients: updates.recipe.map((r) => ({ inventoryItemId: Number(r.inventoryItemId), quantity: r.quantity })) },
      });
    }
    await get().fetchProducts();
  },

  deleteProduct: async (id) => {
    await apiRequest(`/products/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ products: state.products.filter((p) => p.id !== id) }));
  },

  toggleAvailability: async (id) => {
    const product = get().products.find((p) => p.id === id);
    if (!product) return;
    await apiRequest(`/products/${id}/stock`, { method: 'PATCH', auth: true, body: { in_stock: !product.available } });
    set((state) => ({ products: state.products.map((p) => (p.id === id ? { ...p, available: !p.available } : p)) }));
  },
}));
