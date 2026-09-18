import { useState } from 'react';
import { Printer } from 'lucide-react';
import { isPrinterStation, setPrinterStation } from '../../utils/printerStation';

interface Props {
  variant?: 'sheet' | 'sidebar';
}

/** تفعيل/تعطيل "هاد الجهاز هو جهاز الطباعة" — إعداد محلي بالجهاز نفسه (مو بحساب المستخدم)،
 * حتى الطلبات المسجّلة من أي جهاز تاني (موبايل مثلاً) تنطبع تلقائياً هون فقط */
export default function PrinterStationToggle({ variant = 'sheet' }: Props) {
  const [enabled, setEnabled] = useState(isPrinterStation());

  function toggle() {
    const next = !enabled;
    setPrinterStation(next);
    setEnabled(next);
  }

  if (variant === 'sidebar') {
    return (
      <button
        onClick={toggle}
        title="جهاز الطباعة"
        className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 transition-colors ${
          enabled ? 'bg-pos-success/15 text-pos-success' : 'text-pos-navy-600 hover:bg-pos-navy-800 hover:text-white'
        }`}
      >
        <Printer size={18} />
        <span className="text-[9px] font-bold leading-tight">{enabled ? 'جهاز الطباعة ✓' : 'جهاز الطباعة'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${
        enabled ? 'border-pos-success/30 bg-pos-success/10 text-pos-success' : 'border-pos-border text-pos-text'
      }`}
    >
      <span className="flex items-center gap-2">
        <Printer size={17} />
        هاد الجهاز هو جهاز الطباعة
      </span>
      <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${enabled ? 'bg-pos-success' : 'bg-pos-border'}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition-transform ${enabled ? '-translate-x-5' : ''}`} />
      </span>
    </button>
  );
}
