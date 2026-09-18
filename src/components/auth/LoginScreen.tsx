import { useState } from 'react';
import { Delete, LockKeyhole, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { RESTAURANT_NAME } from '../../data/demoData';

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function LoginScreen() {
  const loginWithPin = useAuthStore((s) => s.loginWithPin);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleKey(key: string) {
    setError(false);
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4 || checking) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      const ok = await loginWithPin(next);
      setChecking(false);
      if (!ok) {
        setError(true);
        setTimeout(() => setPin(''), 400);
      }
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-pos-navy-950 p-6" dir="rtl">
      <div className="text-center text-white">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-pos-accent">
          <LockKeyhole size={24} />
        </div>
        <h1 className="text-lg font-bold">{RESTAURANT_NAME}</h1>
        <p className="text-sm text-pos-navy-600">أدخلي رمزك السري (PIN) لتسجيل الدخول</p>
      </div>

      <div className={`flex gap-3 ${error ? 'animate-pulse' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 ${
              i < pin.length ? (error ? 'border-pos-danger bg-pos-danger' : 'border-pos-accent bg-pos-accent') : 'border-pos-navy-700'
            }`}
          />
        ))}
      </div>
      {checking && (
        <p className="-mt-3 flex items-center gap-1.5 text-xs font-semibold text-pos-navy-600">
          <Loader2 size={13} className="animate-spin" /> جاري التحقق...
        </p>
      )}
      {error && !checking && <p className="-mt-3 text-xs font-semibold text-pos-danger">رمز غير صحيح، حاولي مرة ثانية</p>}

      <div className="grid grid-cols-3 gap-3">
        {PAD_KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => handleKey(key)}
              disabled={checking}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pos-navy-900 text-xl font-bold text-white transition-transform active:scale-90 disabled:opacity-50"
            >
              {key === 'del' ? <Delete size={20} /> : key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
