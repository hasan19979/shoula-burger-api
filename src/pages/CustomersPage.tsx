import { useEffect, useState } from 'react';
import { UserCircle2, Star, Phone, ShoppingBag } from 'lucide-react';
import { useCustomersStore, type FavoriteItem } from '../store/customersStore';
import { CURRENCY } from '../data/demoData';

export default function CustomersPage() {
  const { customers, fetchCustomers, fetchFavoriteItems } = useCustomersStore();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setFavorites(await fetchFavoriteItems(id));
  }

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <UserCircle2 size={18} />
          العملاء
        </h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الجوال..."
          className="w-56 rounded-lg border border-pos-border bg-pos-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
        />
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-pos-text-soft">
            <UserCircle2 size={32} className="opacity-30" />
            <p className="text-sm">ما في عملاء بعد — بيتسجّلوا تلقائياً من طلبات الموقع والكاشير</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-2xl border border-pos-border bg-pos-surface p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-pos-text">{c.name}</p>
                    <p className="flex items-center gap-1 text-xs text-pos-text-soft">
                      <Phone size={11} /> {c.phone}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-pos-warning/10 px-2.5 py-1 text-[11px] font-bold text-pos-warning">
                    <Star size={11} /> {c.loyalty_points} نقطة
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-pos-bg p-2">
                    <p className="text-sm font-extrabold text-pos-navy-900">{c.order_count}</p>
                    <p className="text-[10px] text-pos-text-soft">طلب</p>
                  </div>
                  <div className="rounded-lg bg-pos-bg p-2">
                    <p className="text-sm font-extrabold text-pos-navy-900">{Number(c.total_spent).toFixed(0)} {CURRENCY}</p>
                    <p className="text-[10px] text-pos-text-soft">إجمالي الصرف</p>
                  </div>
                </div>

                <button
                  onClick={() => toggleExpand(c.id)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-pos-border py-2 text-[11px] font-bold text-pos-text"
                >
                  <ShoppingBag size={12} /> {expandedId === c.id ? 'إخفاء' : 'الأصناف المفضّلة'}
                </button>

                {expandedId === c.id && (
                  <div className="mt-2 space-y-1">
                    {favorites.length === 0 ? (
                      <p className="text-center text-[11px] text-pos-text-soft">ما في بيانات كافية</p>
                    ) : (
                      favorites.map((f) => (
                        <div key={f.product_name} className="flex justify-between rounded-lg bg-pos-bg px-2.5 py-1.5 text-[11px]">
                          <span className="text-pos-text">{f.product_name}</span>
                          <span className="font-bold text-pos-text-soft">×{f.total_quantity}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
