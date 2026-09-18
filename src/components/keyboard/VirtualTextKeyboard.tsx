import { useState } from 'react';
import { Delete, CornerDownLeft, Globe, Mic } from 'lucide-react';
import { useKeyboardStore } from '../../store/keyboardStore';

/** نفس ترتيب حروف كيبورد الآيفون العربي الأصلي بالضبط — بدون صف أرقام، حروف بس */
const ARABIC_ROWS = [
  ['ج', 'ح', 'خ', 'ه', 'ع', 'غ', 'ف', 'ق', 'ث', 'ص', 'ض'],
  ['ة', 'ك', 'م', 'ن', 'ت', 'ا', 'ل', 'ب', 'ي', 'س', 'ش'],
  ['ى', 'و', 'ر', 'ز', 'د', 'ذ', 'ط', 'ظ', 'ء'],
];

const ENGLISH_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

type Lang = 'ar' | 'en';

/** نفس شكل كيبورد الآيفون العربي الأصلي — مفاتيح بيضاء بارزة، تسمية "مسافة"، وسهم إدخال بدل "تم" */
export default function VirtualTextKeyboard() {
  const { value, setValue, close } = useKeyboardStore();
  const [lang, setLang] = useState<Lang>('ar');

  function pressKey(char: string) {
    setValue(value + char);
  }
  function backspace() {
    setValue(value.slice(0, -1));
  }

  const rows = lang === 'ar' ? ARABIC_ROWS : ENGLISH_ROWS;
  const keyClass =
    'flex h-12 flex-1 items-center justify-center rounded-lg bg-white text-lg font-medium text-black shadow-sm border-b-2 border-gray-300 transition-transform active:scale-95 active:bg-gray-100';

  return (
    <div className="bg-[#d3d6dc] p-2" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {rows.map((row, i) => (
        <div key={i} className="mb-1.5 flex justify-center gap-1.5">
          {i === rows.length - 1 && (
            <button onClick={backspace} className="flex h-12 w-14 items-center justify-center rounded-lg bg-[#a9adb5] text-black shadow-sm active:bg-gray-400">
              <Delete size={20} />
            </button>
          )}
          {row.map((char) => (
            <button key={char} onClick={() => pressKey(char)} className={keyClass}>
              {char}
            </button>
          ))}
        </div>
      ))}

      <div className="flex gap-1.5">
        <button
          onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
          className="flex h-12 w-14 items-center justify-center rounded-lg bg-[#a9adb5] text-black shadow-sm active:bg-gray-400"
        >
          <Globe size={18} />
        </button>
        <button className="flex h-12 w-11 items-center justify-center rounded-lg bg-[#a9adb5] text-black shadow-sm active:bg-gray-400">
          <Mic size={18} />
        </button>
        <button onClick={() => pressKey(' ')} className="flex h-12 flex-1 items-center justify-center rounded-lg bg-white text-sm font-medium text-black shadow-sm active:bg-gray-100">
          مسافة
        </button>
        <button
          onClick={close}
          className="flex h-12 w-16 items-center justify-center rounded-lg bg-pos-accent text-white shadow-sm active:opacity-90"
        >
          <CornerDownLeft size={20} />
        </button>
      </div>
    </div>
  );
}
