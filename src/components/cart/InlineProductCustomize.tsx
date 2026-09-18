import { Check, Minus, Plus, X } from 'lucide-react';
import type { CartItem, Product } from '../../types';
import { CURRENCY } from '../../data/demoData';
import { useCartStore } from '../../store/cartStore';
import { useProductCustomize } from '../../hooks/useProductCustomize';

interface Props {
  product: Product;
  editingItem?: CartItem; // لو موجودة، معناها عم نعدّل صنف موجود أصلاً بالسلة مو نضيف جديد
  onDone: () => void;
}

export default function InlineProductCustomize({ product, editingItem, onDone }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const updateItemDetails = useCartStore((s) => s.updateItemDetails);
  const {
    groups, selections, toggleOption, quantity, setQuantity, notes, setNotes,
    selectedModifiers, removedIngredients, totalPrice, isValid,
  } = useProductCustomize(product, editingItem);

  function handleSubmit() {
    if (!isValid) return;
    if (editingItem) {
      updateItemDetails(editingItem.lineId, { quantity, selectedModifiers, removedIngredients, notes: notes.trim() || undefined });
    } else {
      addItem({ product, quantity, selectedModifiers, removedIngredients, notes: notes.trim() || undefined });
    }
    onDone();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-b border-pos-border">
      <div className="flex shrink-0 items-center justify-between border-b border-pos-border px-4 py-3">
        <h2 className="text-sm font-bold text-pos-text">{editingItem ? 'تعديل' : 'تخصيص'} {product.name}</h2>
        <button onClick={onDone} className="flex h-7 w-7 items-center justify-center rounded-full text-pos-text-soft hover:bg-pos-bg">
          <X size={16} />
        </button>
      </div>

      <div className="pos-scroll flex-1 overflow-y-auto px-4 py-3">
        {groups.map((group) => (
          <div key={group.id} className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-pos-text">{group.name}</h3>
              {group.required && <span className="text-[10px] font-semibold text-pos-danger">إجباري</span>}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {group.options.map((opt) => {
                const isSelected = selections[group.id]?.has(opt.id) ?? false;
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggleOption(group, opt.id)}
                    className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                      isSelected
                        ? 'border-pos-accent bg-pos-accent/10 font-semibold text-pos-accent'
                        : 'border-pos-border text-pos-text-soft'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center border ${
                          group.selectionType === 'single' ? 'rounded-full' : 'rounded'
                        } ${isSelected ? 'border-pos-accent bg-pos-accent text-white' : 'border-pos-text-soft/40'}`}
                      >
                        {isSelected && <Check size={9} />}
                      </span>
                      {opt.name}
                    </span>
                    {opt.price > 0 && <span className="text-[10px] font-bold">+{opt.price}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">ملاحظة خاصة (اختياري)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً: بدون تحمير زائد"
            rows={2}
            className="w-full resize-none rounded-lg border border-pos-border bg-pos-bg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-pos-border px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-pos-border px-1.5 py-1">
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-7 w-7 items-center justify-center rounded-md bg-pos-bg text-pos-text">
            <Minus size={13} />
          </button>
          <span className="w-4 text-center text-xs font-bold">{quantity}</span>
          <button onClick={() => setQuantity((q) => q + 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-pos-bg text-pos-text">
            <Plus size={13} />
          </button>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-pos-accent py-3 text-xs font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {editingItem ? 'حفظ التعديل' : 'إضافة للطلب'} — {totalPrice.toFixed(2)} {CURRENCY}
        </button>
      </div>
    </div>
  );
}
