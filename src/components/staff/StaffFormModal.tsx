import { useState } from 'react';
import type { StaffRecord } from '../../store/staffStore';
import { useStaffStore } from '../../store/staffStore';
import { ROLE_LABELS } from '../../utils/permissions';
import type { Role } from '../../types';
import { CURRENCY } from '../../data/demoData';
import Modal from '../modals/Modal';

interface Props {
  staff: StaffRecord | null; // null = موظف جديد
  onClose: () => void;
}

const ROLES: Role[] = ['admin', 'manager', 'cashier', 'kitchen', 'waiter'];

export default function StaffFormModal({ staff, onClose }: Props) {
  const { addStaff, updateStaff } = useStaffStore();
  const isEdit = !!staff;

  const [name, setName] = useState(staff?.name ?? '');
  const [role, setRole] = useState<Role>(staff?.role ?? 'cashier');
  const [pin, setPin] = useState('');
  const [hourlyRate, setHourlyRate] = useState(staff?.hourly_rate ? String(staff.hourly_rate) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    if (!isEdit && pin.length !== 4) {
      setError('الرمز السري لازم يكون 4 أرقام بالضبط');
      return;
    }
    if (pin && pin.length !== 4) {
      setError('الرمز السري لازم يكون 4 أرقام بالضبط');
      return;
    }

    setSaving(true);
    setError(null);
    const rateValue = hourlyRate.trim() ? Number(hourlyRate) : null;
    try {
      if (isEdit && staff) {
        await updateStaff(staff.id, { name: name.trim(), role, hourlyRate: rateValue, ...(pin ? { pin } : {}) });
      } else {
        await addStaff({ name: name.trim(), role, pin, hourlyRate: rateValue });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'صار خطأ، حاولي مرة ثانية');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `تعديل ${staff?.name}` : 'إضافة موظف جديد'}
      onClose={onClose}
      footer={
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="w-full rounded-xl bg-pos-navy-900 py-3.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الموظف'}
        </button>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg bg-pos-danger/10 p-2.5 text-xs font-semibold text-pos-danger">{error}</div>}

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">الاسم *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="pos-input" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">الدور *</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="pos-input">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">أجر الساعة ({CURRENCY}) — اختياري، لحساب سجل الحضور</label>
          <input
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="مثلاً: 25"
            className="pos-input"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-pos-text">
            {isEdit ? 'رمز سري جديد (اتركيه فاضي لو ما بدك تغيّريه)' : 'الرمز السري (4 أرقام) *'}
          </label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="مثلاً: 7890"
            className="pos-input text-center tracking-widest"
          />
        </div>
      </div>
    </Modal>
  );
}
