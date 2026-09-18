import { useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { ModifierGroup, Product, SelectedModifier } from '../../types';
import { CURRENCY } from '../../data/demoData';
import { useModifierGroupsStore } from '../../store/modifierGroupsStore';
import { useCartStore } from '../../store/cartStore';
import Modal from './Modal';

interface Props {
  product: Product;
  onClose: () => void;
}

export default function ProductCustomizeModal({ product, onClose }: Props) {
  const addItem = useCartStore((s) => s.addItem);

  const allGroups = useModifierGroupsStore((s) => s.groups);
  const groups: ModifierGroup[] = useMemo(
    () => product.modifierGroupIds.map((id) => allGroups.find((g) => g.id === id)).filter(Boolean) as ModifierGroup[],
    [product.modifierGroupIds, allGroups]
  );

  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const group of groups) {
      if (group.selectionType === 'multiple') {
        initial[group.id] = new Set(group.options.filter((o) => o.defaultIncluded).map((o) => o.id));
      } else {
        initial[group.id] = new Set(group.options[0] ? [group.options[0].id] : []);
      }
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  function toggleOption(group: ModifierGroup, optionId: string) {
    setSelections((prev) => {
      const current = new Set(prev[group.id]);
      if (group.selectionType === 'single') {
        return { ...prev, [group.id]: new Set([optionId]) };
      }
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (current.size >= group.max) return prev; // بلغ الحد الأقصى المسموح لهاي المجموعة
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  const selectedModifiers: SelectedModifier[] = useMemo(() => {
    const result: SelectedModifier[] = [];
    for (const group of groups) {
      const ids = selections[group.id] ?? new Set<string>();
      for (const optId of ids) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) result.push({ groupId: group.id, groupName: group.name, optionId: opt.id, optionName: opt.name, price: opt.price });
      }
    }
    return result;
  }, [selections, groups]);

  const removedIngredients = useMemo(() => {
    const removed: string[] = [];
    for (const group of groups) {
      const ids = selections[group.id] ?? new Set<string>();
      for (const opt of group.options) {
        if (opt.defaultIncluded && !ids.has(opt.id)) removed.push(opt.name);
      }
    }
    return removed;
  }, [selections, groups]);

  const unitPrice = product.price + selectedModifiers.reduce((sum, m) => sum + m.price, 0);
  const totalPrice = unitPrice * quantity;

  const isValid = groups.every((g) => !g.required || (selections[g.id]?.size ?? 0) >= g.min);

  function handleAdd() {
    if (!isValid) return;
    addItem({ product, quantity, selectedModifiers, removedIngredients, notes: notes.trim() || undefined });
    onClose();
  }

  return (
    <Modal
      title={`تخصيص ${product.name}`}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-pos-border px-2 py-1.5">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-pos-bg text-pos-text"
            >
              <Minus size={15} />
            </button>
            <span className="w-5 text-center text-sm font-bold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-pos-bg text-pos-text"
            >
              <Plus size={15} />
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!isValid}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-pos-accent py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            إضافة للطلب — {totalPrice.toFixed(2)} {CURRENCY}
          </button>
        </div>
      }
    >
      {groups.map((group) => (
        <div key={group.id} className="mb-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-pos-text">{group.name}</h3>
            {group.required && <span className="text-[11px] font-semibold text-pos-danger">إجباري</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {group.options.map((opt) => {
              const isSelected = selections[group.id]?.has(opt.id) ?? false;
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleOption(group, opt.id)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    isSelected
                      ? 'border-pos-accent bg-pos-accent/10 font-semibold text-pos-accent'
                      : 'border-pos-border text-pos-text-soft'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-4 w-4 items-center justify-center border ${
                        group.selectionType === 'single' ? 'rounded-full' : 'rounded'
                      } ${isSelected ? 'border-pos-accent bg-pos-accent text-white' : 'border-pos-text-soft/40'}`}
                    >
                      {isSelected && <Check size={11} />}
                    </span>
                    {opt.name}
                  </span>
                  {opt.price > 0 && <span className="text-xs font-bold">+{opt.price}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <label className="mb-2 block text-sm font-bold text-pos-text">ملاحظة خاصة (اختياري)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="مثلاً: بدون تحمير زائد"
          rows={2}
          className="w-full resize-none rounded-xl border border-pos-border bg-pos-bg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
        />
      </div>
    </Modal>
  );
}
