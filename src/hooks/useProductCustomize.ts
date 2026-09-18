import { useMemo, useState } from 'react';
import type { CartItem, ModifierGroup, Product, SelectedModifier } from '../types';
import { useModifierGroupsStore } from '../store/modifierGroupsStore';

interface InitialState {
  selectedModifiers: SelectedModifier[];
  notes?: string;
  quantity: number;
}

/** لو بدك تعدّلي على صنف موجود أصلاً بالسلة، ابعتي بياناته هون حتى تتعبّى الشاشة بيها بدل القيم الافتراضية */
export function useProductCustomize(product: Product, editingItem?: CartItem) {
  const allGroups = useModifierGroupsStore((s) => s.groups);
  const groups: ModifierGroup[] = useMemo(
    () => product.modifierGroupIds.map((id) => allGroups.find((g) => g.id === id)).filter(Boolean) as ModifierGroup[],
    [product.modifierGroupIds, allGroups]
  );

  const initial: InitialState | null = editingItem
    ? { selectedModifiers: editingItem.selectedModifiers, notes: editingItem.notes, quantity: editingItem.quantity }
    : null;

  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    if (initial) {
      // إعادة بناء الاختيارات من بيانات السطر الموجود بالسلة (تعديل)
      const map: Record<string, Set<string>> = {};
      for (const group of groups) map[group.id] = new Set();
      for (const m of initial.selectedModifiers) {
        if (!map[m.groupId]) map[m.groupId] = new Set();
        map[m.groupId].add(m.optionId);
      }
      return map;
    }
    // القيم الافتراضية لصنف جديد (المكونات الأساسية مفعّلة تلقائياً)
    const map: Record<string, Set<string>> = {};
    for (const group of groups) {
      if (group.selectionType === 'multiple') {
        map[group.id] = new Set(group.options.filter((o) => o.defaultIncluded).map((o) => o.id));
      } else {
        map[group.id] = new Set(group.options[0] ? [group.options[0].id] : []);
      }
    }
    return map;
  });
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? '');

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

  return {
    groups, selections, toggleOption, quantity, setQuantity, notes, setNotes,
    selectedModifiers, removedIngredients, unitPrice, totalPrice, isValid,
  };
}
