import { useKeyboardStore, type KeyboardMode } from '../../store/keyboardStore';
import { isTouchDevice } from '../../utils/isTouchDevice';

interface Props {
  value: string;
  onChange: (value: string) => void;
  mode: KeyboardMode;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  onClose?: () => void;
}

/**
 * حقل إدخال بيفتح لوحة مفاتيح داخلية بالتطبيق (نامباد للأرقام، كيبورد عربي للنصوص) بدل لوحة مفاتيح
 * الجهاز نفسها — بس بس على أجهزة اللمس (تاچ سكرين) الحقيقية. على لابتوب/كمبيوتر بكيبورد فعلي،
 * الحقل بيشتغل عادي (تكتبي فيه مباشرة بدون ما يفتحلك أي كيبورد داخلي).
 */
export default function KeyboardInput({ value, onChange, mode, placeholder, className, maxLength, onClose }: Props) {
  const open = useKeyboardStore((s) => s.open);
  const touch = isTouchDevice();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(maxLength ? v.slice(0, maxLength) : v);
  }

  if (!touch) {
    // جهاز عادي (لابتوب/كمبيوتر) — إدخال طبيعي بالكيبورد الحقيقي
    return (
      <input
        value={value}
        onChange={handleChange}
        onBlur={onClose}
        placeholder={placeholder}
        className={className}
        inputMode={mode === 'numeric' ? 'decimal' : 'text'}
      />
    );
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.blur(); // منمنع لوحة مفاتيح الجهاز الأصلية من الظهور فوراً
    open({ mode, value, onChange: (v) => onChange(maxLength ? v.slice(0, maxLength) : v), onClose });
  }

  function handleClick() {
    open({ mode, value, onChange: (v) => onChange(maxLength ? v.slice(0, maxLength) : v), onClose });
  }

  return (
    <input
      value={value}
      readOnly
      inputMode="none"
      onFocus={handleFocus}
      onClick={handleClick}
      placeholder={placeholder}
      className={className}
    />
  );
}
