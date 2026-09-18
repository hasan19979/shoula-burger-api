import { useKeyboardStore } from '../../store/keyboardStore';
import VirtualNumpad from './VirtualNumpad';
import VirtualTextKeyboard from './VirtualTextKeyboard';

export default function GlobalKeyboard() {
  const { active, mode, close } = useKeyboardStore();
  if (!active) return null;

  if (mode === 'numeric') {
    // النامباد صغير ومربّع بنص الشاشة تقريباً — مش ممدود عالعرض زي كيبورد الحروف
    return (
      <>
        <div className="fixed inset-0 z-[90]" onClick={close} />
        <div className="fixed inset-x-0 bottom-6 z-[95] mx-auto w-[260px] rounded-2xl border border-pos-border bg-pos-surface shadow-2xl">
          <VirtualNumpad />
        </div>
      </>
    );
  }

  return (
    <>
      {/* طبقة شفافة تسكّر الكيبورد لو دُست بره منه */}
      <div className="fixed inset-0 z-[90]" onClick={close} />
      <div className="fixed inset-x-0 bottom-0 z-[95] rounded-t-2xl border-t border-pos-border bg-pos-surface shadow-2xl">
        <VirtualTextKeyboard />
      </div>
    </>
  );
}
