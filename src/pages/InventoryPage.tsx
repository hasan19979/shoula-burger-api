import { useEffect, useMemo, useState } from 'react';
import { Boxes, Plus, Pencil, Trash2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useInventoryStore, isLowStock } from '../store/inventoryStore';
import type { InventoryItem, InventoryUnit } from '../types';
import InventoryFormModal from '../components/inventory/InventoryFormModal';
import PurchaseLogModal from '../components/inventory/PurchaseLogModal';

const UNIT_LABELS: Record<InventoryUnit, string> = { g: 'غ', kg: 'كغ', ml: 'مل', l: 'ل', piece: 'قطعة' };

export default function InventoryPage() {
  const { items, fetchItems, deleteItem, adjustStock } = useInventoryStore();
  const [editingItem, setEditingItem] = useState<InventoryItem | null | undefined>(undefined);
  const [purchasingItem, setPurchasingItem] = useState<InventoryItem | null>(null);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const lowStockCount = useMemo(() => items.filter(isLowStock).length, [items]);
  const sortedItems = useMemo(() => [...items].sort((a, b) => (isLowStock(b) ? 1 : 0) - (isLowStock(a) ? 1 : 0)), [items]);

  function handleDelete(item: InventoryItem) {
    if (confirm(`متأكدة من حذف "${item.name}" من المخزون؟`)) deleteItem(item.id);
  }

  function handleWaste(item: InventoryItem) {
    const qty = Number(prompt(`كمية الهدر/التالف (${UNIT_LABELS[item.unit]})؟`));
    if (!qty || qty <= 0) return;
    const reason = prompt('السبب؟') || 'بدون سبب محدد';
    adjustStock(item.id, -qty, 'waste', reason);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <Boxes size={18} />
          المخزون
          {lowStockCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-pos-danger/10 px-2 py-0.5 text-[11px] font-bold text-pos-danger">
              <AlertTriangle size={11} /> {lowStockCount} بحاجة تجديد
            </span>
          )}
        </h1>
        <button onClick={() => setEditingItem(null)} className="flex items-center gap-1.5 rounded-lg bg-pos-accent px-3.5 py-2 text-xs font-bold text-white">
          <Plus size={14} /> إضافة مادة
        </button>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sortedItems.map((item) => {
            const low = isLowStock(item);
            return (
              <div key={item.id} className={`rounded-2xl border bg-pos-surface p-4 ${low ? 'border-pos-danger/40' : 'border-pos-border'}`}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-pos-text">{item.name}</p>
                    <p className="text-[11px] text-pos-text-soft">حد أدنى: {item.minThreshold} {UNIT_LABELS[item.unit]}</p>
                  </div>
                  {low && (
                    <span className="flex items-center gap-1 rounded-full bg-pos-danger/10 px-2 py-1 text-[10px] font-bold text-pos-danger">
                      <AlertTriangle size={10} /> ناقص
                    </span>
                  )}
                </div>

                <p className={`mb-3 text-xl font-extrabold ${low ? 'text-pos-danger' : 'text-pos-navy-900'}`}>
                  {item.quantity.toLocaleString('ar')} <span className="text-xs font-semibold">{UNIT_LABELS[item.unit]}</span>
                </p>

                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPurchasingItem(item)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-pos-success/10 py-2 text-[11px] font-bold text-pos-success">
                    <TrendingUp size={12} /> شراء
                  </button>
                  <button onClick={() => handleWaste(item)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-pos-warning/10 py-2 text-[11px] font-bold text-pos-warning">
                    <TrendingDown size={12} /> هدر
                  </button>
                  <button onClick={() => setEditingItem(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-border text-pos-text">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => handleDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-danger/30 text-pos-danger">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingItem !== undefined && <InventoryFormModal item={editingItem} onClose={() => setEditingItem(undefined)} />}
      {purchasingItem && <PurchaseLogModal item={purchasingItem} onClose={() => setPurchasingItem(null)} />}
    </div>
  );
}
