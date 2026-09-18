import { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { isManagerLevel } from '../../utils/permissions';
import type { Role } from '../../types';

interface Props {
  title: string;
  onApprove: (approverName: string) => void;
  onCancel: () => void;
}

/** بوّابة موافقة مدير — بتتحقق من PIN مدير/مدير عام عن طريق السيرفر الحقيقي قبل ما تسمح بعملية محظورة */
export default function ManagerApprovalPrompt({ title, onApprove, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleSubmit() {
    if (pin.length !== 4) return;
    setChecking(true);
    setError(false);
    try {
      const data = await apiRequest<{ staff: { name: string; role: Role } }>('/staff/login', {
        method: 'POST',
        body: { pin },
      });
      if (isManagerLevel(data.staff.role)) {
        onApprove(data.staff.name);
      } else {
        setError(true);
        setPin('');
      }
    } catch {
      setError(true);
      setPin('');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xs rounded-2xl bg-pos-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-pos-warning">
            <ShieldAlert size={17} /> موافقة مدير مطلوبة
          </span>
          <button onClick={onCancel} className="text-pos-text-soft">
            <X size={16} />
          </button>
        </div>
        <p className="mb-3 text-xs text-pos-text-soft">{title}</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setError(false);
            setPin(e.target.value.replace(/\D/g, ''));
          }}
          placeholder="رمز المدير (PIN)"
          className={`mb-3 w-full rounded-xl border px-3 py-2.5 text-center text-lg tracking-widest focus:outline-none focus:ring-2 ${
            error ? 'border-pos-danger focus:ring-pos-danger' : 'border-pos-border focus:ring-pos-accent'
          }`}
        />
        {error && <p className="mb-2 text-[11px] font-semibold text-pos-danger">رمز غير صحيح أو ما عنده صلاحية مدير</p>}
        <button onClick={handleSubmit} disabled={checking || pin.length !== 4} className="w-full rounded-xl bg-pos-navy-900 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {checking ? 'جاري التحقق...' : 'تأكيد'}
        </button>
      </div>
    </div>
  );
}
