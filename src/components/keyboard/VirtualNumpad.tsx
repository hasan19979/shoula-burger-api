import { Delete, Check } from 'lucide-react';
import { useKeyboardStore } from '../../store/keyboardStore';

export default function VirtualNumpad() {
  const { value, setValue, close } = useKeyboardStore();

  function press(key: string) {
    setValue(value + key);
  }
  function backspace() {
    setValue(value.slice(0, -1));
  }

  const numKeyClass =
    'flex h-12 flex-1 items-center justify-center rounded-lg bg-pos-bg text-lg font-bold text-pos-text transition-transform active:scale-95 active:bg-pos-border';

  return (
    <div className="p-3">
      {/* الصف العلوي: ٩ ٨ ٧ (من اليمين لليسار) */}
      <div className="mb-2 flex gap-2">
        <button onClick={() => press('9')} className={numKeyClass}>9</button>
        <button onClick={() => press('8')} className={numKeyClass}>8</button>
        <button onClick={() => press('7')} className={numKeyClass}>7</button>
      </div>
      {/* الصف الأوسط: ٦ ٥ ٤ */}
      <div className="mb-2 flex gap-2">
        <button onClick={() => press('6')} className={numKeyClass}>6</button>
        <button onClick={() => press('5')} className={numKeyClass}>5</button>
        <button onClick={() => press('4')} className={numKeyClass}>4</button>
      </div>
      {/* الصف السفلي: ٣ ٢ ١ */}
      <div className="mb-2 flex gap-2">
        <button onClick={() => press('3')} className={numKeyClass}>3</button>
        <button onClick={() => press('2')} className={numKeyClass}>2</button>
        <button onClick={() => press('1')} className={numKeyClass}>1</button>
      </div>
      {/* بالأسفل: صفر عريض، مع الحذف */}
      <div className="mb-2 flex gap-2">
        <button onClick={() => press('0')} className={`${numKeyClass} flex-[2]`}>0</button>
        <button onClick={backspace} className="flex h-12 flex-1 items-center justify-center rounded-lg bg-pos-border text-pos-text active:bg-pos-border/70">
          <Delete size={18} />
        </button>
      </div>
      <button
        onClick={close}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-pos-accent text-sm font-bold text-white active:opacity-90"
      >
        <Check size={16} /> تم
      </button>
    </div>
  );
}
