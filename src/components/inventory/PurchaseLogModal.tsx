import { useEffect, useState } from 'react';
import type { InventoryItem, InventoryUnit } from '../../types';
import { useInventoryStore } from '../../store/inventoryStore';
import { useSuppliersStore } from '../../store/suppliersStore';
import { CURRENCY } from '../../data/demoData';
import Modal from '../modals/Modal';

const UNIT_LABELS: Record<InventoryUnit, string> = { g: 'غ', kg: 'كغ', ml: 'مل', l: 'ل', piece: 'قطعة' };

interface Props {
  item: InventoryItem;
  onClose: () => void;
}

export default function PurchaseLogModal({ item, onClose }: Props) {
  const adjustStock = useInventoryStore((s) => s.adjustStock);
  const { suppliers, fetchSuppliers } = useSuppliersStore();
  const [quantity, setQuantity] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [unitCost, setUnitCost] = useState(item.costPerUnit ? String(item.costPerUnit) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  async function handleSave() {
    const qty = Number(quantity);
    if (!qty || qty <= 0) return;
    setSaving(true);
    try {
      await adjustStock(
        item.id, qty, 'purchase', 'إضافة مخزون جديد',
        supplierId ? Number(supplierId) : undefined,
        unitCost ? Number(unitCost) : undefined
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`تسجيل شراء — ${item.name}`}
      onClose={onClose}
      footer={
        <button onClick={handleSave} disabled={!quantity || saving} className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40">
          {saving ? 'جاري الحفظ...' : 'تسجيل الشراء'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">الكمية ({UNIT_LABELS[item.unit]}) *</label>
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="pos-input" autoFocus />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">المورد (اختياري)</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="pos-input">
            <option value="">بدون تحديد</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">تكلفة الوحدة ({CURRENCY}) — اختياري</label>
          <input type="number" step="0.001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="pos-input" />
        </div>
      </div>
    </Modal>
  );
}
