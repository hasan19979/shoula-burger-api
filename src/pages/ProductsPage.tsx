import { useState } from 'react';
import { Package, Plus, Pencil, Trash2, ImageOff } from 'lucide-react';
import { useProductsStore } from '../store/productsStore';
import { categories, CURRENCY } from '../data/demoData';
import type { Product } from '../types';
import ProductFormModal from '../components/products/ProductFormModal';

export default function ProductsPage() {
  const { products, deleteProduct, toggleAvailability } = useProductsStore();
  const [editingProduct, setEditingProduct] = useState<Product | null | undefined>(undefined); // undefined = مسكّر

  function handleDelete(product: Product) {
    if (confirm(`متأكدة من حذف "${product.name}"؟`)) deleteProduct(product.id);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <Package size={18} />
          المنتجات
        </h1>
        <button
          onClick={() => setEditingProduct(null)}
          className="flex items-center gap-1.5 rounded-lg bg-pos-accent px-3.5 py-2 text-xs font-bold text-white"
        >
          <Plus size={14} /> إضافة صنف
        </button>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const category = categories.find((c) => c.id === product.categoryId);
            const margin = product.cost && product.price ? (((product.price - product.cost) / product.price) * 100).toFixed(0) : null;
            return (
              <div key={product.id} className={`rounded-2xl border bg-pos-surface p-4 ${product.available ? 'border-pos-border' : 'border-pos-danger/30 opacity-60'}`}>
                <div className="mb-3 flex gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-pos-bg">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      <ImageOff size={18} className="text-pos-text-soft/50" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-pos-text">{product.name}</p>
                    <p className="text-[11px] text-pos-text-soft">{category?.name}</p>
                    <p className="mt-1 text-sm font-extrabold text-pos-navy-900">
                      {product.price} {CURRENCY}
                    </p>
                  </div>
                </div>

                {(product.sku || margin) && (
                  <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-pos-text-soft">
                    {product.sku && <span>SKU: {product.sku}</span>}
                    {margin && <span>هامش الربح: {margin}%</span>}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAvailability(product.id)}
                    className={`flex-1 rounded-lg py-2 text-[11px] font-bold ${
                      product.available ? 'bg-pos-success/10 text-pos-success' : 'bg-pos-danger/10 text-pos-danger'
                    }`}
                  >
                    {product.available ? 'متوفر' : 'غير متوفر'}
                  </button>
                  <button
                    onClick={() => setEditingProduct(product)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-border text-pos-text"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-danger/30 text-pos-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingProduct !== undefined && (
        <ProductFormModal product={editingProduct} onClose={() => setEditingProduct(undefined)} />
      )}
    </div>
  );
}
