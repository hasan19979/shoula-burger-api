import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useKeyboardStore } from '../../store/keyboardStore';

/** زر تجربة مؤقت — بيفتح الكيبورد الداخلي بالإجبار بغض النظر عن نوع الجهاز، حتى تقدري تشوفيه
 * وتجربيه من أي جهاز (لابتوب، كمبيوتر، أي شي) وقت التطوير. ما بيظهر إطلاقاً بالنسخة النهائية
 * المنشورة (import.meta.env.DEV بس صحيحة وقت `npm run dev`، مو وقت `npm run build`). */
export default function KeyboardDebugButton() {
  const open = useKeyboardStore((s) => s.open);
  const [testValue, setTestValue] = useState('');

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[80] flex flex-col gap-2">
      <button
        onClick={() => open({ mode: 'numeric', value: testValue, onChange: setTestValue })}
        className="flex items-center gap-1.5 rounded-full bg-pos-warning px-3 py-2 text-[11px] font-bold text-white shadow-lg"
      >
        <Keyboard size={13} /> تجربة نامباد
      </button>
      <button
        onClick={() => open({ mode: 'text', value: testValue, onChange: setTestValue })}
        className="flex items-center gap-1.5 rounded-full bg-pos-warning px-3 py-2 text-[11px] font-bold text-white shadow-lg"
      >
        <Keyboard size={13} /> تجربة كيبورد نص
      </button>
      {testValue && <span className="rounded-lg bg-black/70 px-2 py-1 text-[10px] text-white">{testValue}</span>}
    </div>
  );
}
