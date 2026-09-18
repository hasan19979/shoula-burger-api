import { useMemo, useState } from 'react';
import type { CartItem, Product } from '../types';
import { useCartStore } from '../store/cartStore';
import { useProductsStore } from '../store/productsStore';
import TopBar from '../components/layout/TopBar';
import CustomerInfoBar from '../components/layout/CustomerInfoBar';
import CategorySidebar from '../components/pos/CategorySidebar';
import SearchBar from '../components/pos/SearchBar';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/cart/CartPanel';

export default function POSPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | undefined>(undefined);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const products = useProductsStore((s) => s.products);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = activeCategory === 'all' || p.categoryId === activeCategory;
      const matchesSearch = !query || p.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, activeCategory, search]);

  function handleTapProduct(product: Product) {
    if (product.modifierGroupIds.length > 0) {
      setEditingItem(undefined);
      setCustomizingProduct(product);
      setMobileCartOpen(true); // بالموبايل، لازم تفتح لوحة السلة حتى تبين شاشة التخصيص
    } else {
      // منتج بسيط بدون تعديلات — يضاف بضغطة وحدة مباشرة (وبيتجمّع مع نفس الصنف لو موجود أصلاً بالسلة)
      addItem({ product, quantity: 1, selectedModifiers: [], removedIngredients: [] });
    }
  }

  function handleEditItem(item: CartItem) {
    setEditingItem(item);
    setCustomizingProduct(item.product);
    setMobileCartOpen(true);
  }

  function handleCloseCustomize() {
    setCustomizingProduct(null);
    setEditingItem(undefined);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TopBar />
      <CustomerInfoBar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <CategorySidebar activeCategory={activeCategory} onSelect={setActiveCategory} />

        <main className="pos-scroll flex-1 overflow-y-auto p-4 md:p-5">
          <div className="mb-4">
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <ProductGrid products={filteredProducts} onTapProduct={handleTapProduct} />
        </main>

        <CartPanel
          customizingProduct={customizingProduct}
          editingItem={editingItem}
          onCloseCustomize={handleCloseCustomize}
          onEditItem={handleEditItem}
          mobileOpen={mobileCartOpen}
          onMobileOpenChange={setMobileCartOpen}
        />
      </div>
    </div>
  );
}
