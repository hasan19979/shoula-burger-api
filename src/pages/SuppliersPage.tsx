import { useEffect, useState } from 'react';
import { Truck, Plus, Pencil, Trash2, Phone, User, Package } from 'lucide-react';
import { useSuppliersStore, type SupplierRecord, type PurchaseRecord } from '../store/suppliersStore';
import { CURRENCY } from '../data/demoData';
import SupplierFormModal from '../components/suppliers/SupplierFormModal';

export default function SuppliersPage() {
  const { suppliers, fetchSuppliers, deleteSupplier, fetchPurchases } = useSuppliersStore();
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  function handleDelete(supplier: SupplierRecord) {
    if (confirm(`متأكدة من حذف "${supplier.name}"؟ (سجل مشترياته السابقة بيضل محفوظ)`)) deleteSupplier(supplier.id);
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setPurchases(await fetchPurchases(id));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <Truck size={18} />
          الموردون
        </h1>
        <button onClick={() => setEditingSupplier(null)} className="flex items-center gap-1.5 rounded-lg bg-pos-accent px-3.5 py-2 text-xs font-bold text-white">
          <Plus size={14} /> إضافة مورد
        </button>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        {suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-pos-text-soft">
            <Truck size={32} className="opacity-30" />
            <p className="text-sm">ما في موردين مسجّلين بعد</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {suppliers.map((s) => (
              <div key={s.id} className="rounded-2xl border border-pos-border bg-pos-surface p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-pos-text">{s.name}</p>
                    {s.contact_person && (
                      <p className="flex items-center gap-1 text-[11px] text-pos-text-soft">
                        <User size={10} /> {s.contact_person}
                      </p>
                    )}
                    {s.phone && (
                      <p className="flex items-center gap-1 text-[11px] text-pos-text-soft">
                        <Phone size={10} /> {s.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-pos-bg p-2">
                    <p className="text-sm font-extrabold text-pos-navy-900">{s.purchase_count}</p>
                    <p className="text-[10px] text-pos-text-soft">عملية شراء</p>
                  </div>
                  <div className="rounded-lg bg-pos-bg p-2">
                    <p className="text-sm font-extrabold text-pos-navy-900">{Number(s.total_spent).toFixed(0)} {CURRENCY}</p>
                    <p className="text-[10px] text-pos-text-soft">إجمالي المشتريات</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleExpand(s.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-pos-border py-2 text-[11px] font-bold text-pos-text"
                  >
                    <Package size={12} /> {expandedId === s.id ? 'إخفاء' : 'سجل المشتريات'}
                  </button>
                  <button onClick={() => setEditingSupplier(s)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-border text-pos-text">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(s)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-danger/30 text-pos-danger">
                    <Trash2 size={12} />
                  </button>
                </div>

                {expandedId === s.id && (
                  <div className="mt-2 space-y-1">
                    {purchases.length === 0 ? (
                      <p className="text-center text-[11px] text-pos-text-soft">ما في مشتريات مسجّلة من هاد المورد بعد</p>
                    ) : (
                      purchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg bg-pos-bg px-2.5 py-1.5 text-[11px]">
                          <span className="text-pos-text">
                            {p.item_name} ×{p.quantity} {p.unit}
                          </span>
                          <span className="font-bold text-pos-text-soft">
                            {p.unit_cost ? `${(Number(p.quantity) * Number(p.unit_cost)).toFixed(2)} ${CURRENCY}` : '—'}
                          </span>
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

      {editingSupplier !== undefined && <SupplierFormModal supplier={editingSupplier} onClose={() => setEditingSupplier(undefined)} />}
    </div>
  );
}
