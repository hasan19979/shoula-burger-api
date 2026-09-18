import { useState } from 'react';
import type { SupplierRecord } from '../../store/suppliersStore';
import { useSuppliersStore } from '../../store/suppliersStore';
import Modal from '../modals/Modal';

interface Props {
  supplier: SupplierRecord | null;
  onClose: () => void;
}

export default function SupplierFormModal({ supplier, onClose }: Props) {
  const { addSupplier, updateSupplier } = useSuppliersStore();
  const isEdit = !!supplier;

  const [name, setName] = useState(supplier?.name ?? '');
  const [contactPerson, setContactPerson] = useState(supplier?.contact_person ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), contactPerson: contactPerson.trim(), phone: phone.trim(), notes: notes.trim() };
      if (isEdit && supplier) await updateSupplier(supplier.id, payload);
      else await addSupplier(payload);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `تعديل ${supplier?.name}` : 'إضافة مورد جديد'}
      onClose={onClose}
      footer={
        <button onClick={handleSave} disabled={!name.trim() || saving} className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40">
          {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">اسم المورد *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pos-input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">اسم الشخص المسؤول</label>
          <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="pos-input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">رقم الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="pos-input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="pos-input resize-none" />
        </div>
      </div>
    </Modal>
  );
}
