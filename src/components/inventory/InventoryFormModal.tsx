import { useState } from 'react';
import type { InventoryItem, InventoryUnit } from '../../types';
import { useInventoryStore } from '../../store/inventoryStore';
import Modal from '../modals/Modal';

interface Props {
  item: InventoryItem | null;
  onClose: () => void;
}

const UNIT_LABELS: Record<InventoryUnit, string> = { g: 'غرام', kg: 'كيلوغرام', ml: 'مل', l: 'لتر', piece: 'قطعة' };

export default function InventoryFormModal({ item, onClose }: Props) {
  const { addItem, updateItem } = useInventoryStore();
  const isEdit = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState<InventoryUnit>(item?.unit ?? 'piece');
  const [quantity, setQuantity] = useState(item?.quantity ?? 0);
  const [minThreshold, setMinThreshold] = useState(item?.minThreshold ?? 0);
  const [costPerUnit, setCostPerUnit] = useState(item?.costPerUnit ?? 0);

  function handleSave() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), unit, quantity, minThreshold, costPerUnit: costPerUnit || undefined };
    if (isEdit && item) updateItem(item.id, payload);
    else addItem(payload);
    onClose();
  }

  return (
    <Modal
      title={isEdit ? `تعديل ${item?.name}` : 'إضافة مادة خام'}
      onClose={onClose}
      footer={
        <button onClick={handleSave} disabled={!name.trim()} className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40">
          {isEdit ? 'حفظ التعديلات' : 'إضافة'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">اسم المادة *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pos-input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">الوحدة</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as InventoryUnit)} className="pos-input">
            {(Object.keys(UNIT_LABELS) as InventoryUnit[]).map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-pos-text">الكمية الحالية</label>
            <input type="number" value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value) || 0)} className="pos-input" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-pos-text">الحد الأدنى</label>
            <input type="number" value={minThreshold || ''} onChange={(e) => setMinThreshold(Number(e.target.value) || 0)} className="pos-input" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">تكلفة الوحدة (اختياري)</label>
          <input type="number" step="0.001" value={costPerUnit || ''} onChange={(e) => setCostPerUnit(Number(e.target.value) || 0)} className="pos-input" />
        </div>
      </div>
    </Modal>
  );
}
