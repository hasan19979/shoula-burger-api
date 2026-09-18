import { useState } from 'react';
import type { ModifierGroup, ModifierSelectionType } from '../../types';
import { useModifierGroupsStore } from '../../store/modifierGroupsStore';
import Modal from '../modals/Modal';

interface Props {
  group: ModifierGroup | null; // null = مجموعة جديدة
  onClose: () => void;
}

export default function ModifierGroupFormModal({ group, onClose }: Props) {
  const { addGroup, updateGroup } = useModifierGroupsStore();
  const isEdit = !!group;

  const [name, setName] = useState(group?.name ?? '');
  const [selectionType, setSelectionType] = useState<ModifierSelectionType>(group?.selectionType ?? 'multiple');
  const [required, setRequired] = useState(group?.required ?? false);
  const [min, setMin] = useState(group?.min ?? 0);
  const [max, setMax] = useState(group?.max ?? 5);

  function handleSave() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), selectionType, required, min, max };
    if (isEdit && group) updateGroup(group.id, payload);
    else addGroup(payload);
    onClose();
  }

  return (
    <Modal
      title={isEdit ? `تعديل ${group?.name}` : 'مجموعة تعديلات جديدة'}
      onClose={onClose}
      footer={
        <button onClick={handleSave} disabled={!name.trim()} className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40">
          {isEdit ? 'حفظ التعديلات' : 'إضافة المجموعة'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">اسم المجموعة * (مثلاً: مكونات البرجر)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pos-input" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">نوع الاختيار</label>
          <div className="flex rounded-lg border border-pos-border p-1">
            <button
              onClick={() => setSelectionType('single')}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold ${selectionType === 'single' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}
            >
              اختيار واحد
            </button>
            <button
              onClick={() => setSelectionType('multiple')}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold ${selectionType === 'multiple' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}
            >
              اختيار متعدد
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-pos-border p-3">
          <span className="text-sm font-semibold text-pos-text">إجباري (Required)</span>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-5 w-5" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-pos-text">الحد الأدنى للاختيار</label>
            <input type="number" value={min} onChange={(e) => setMin(Number(e.target.value) || 0)} className="pos-input" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-pos-text">الحد الأقصى للاختيار</label>
            <input type="number" value={max} onChange={(e) => setMax(Number(e.target.value) || 1)} className="pos-input" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
