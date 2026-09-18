import { useEffect, useState } from 'react';
import { Clock, LogIn, LogOut as ClockOutIcon } from 'lucide-react';
import { useAttendanceStore } from '../../store/attendanceStore';

function formatElapsed(clockIn: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

interface Props {
  variant?: 'sidebar' | 'sheet';
}

export default function ClockWidget({ variant = 'sidebar' }: Props) {
  const { clockedIn, currentEntry, fetchStatus, clockIn, clockOut } = useAttendanceStore();
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      forceTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function handleToggle() {
    setBusy(true);
    try {
      if (clockedIn) await clockOut();
      else await clockIn();
    } catch {
      alert('صار خطأ، حاولي مرة ثانية');
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'sheet') {
    return (
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${
          clockedIn ? 'border-pos-success/30 bg-pos-success/10 text-pos-success' : 'border-pos-border text-pos-text'
        }`}
      >
        <span className="flex items-center gap-2">
          {clockedIn ? <ClockOutIcon size={17} /> : <LogIn size={17} />}
          {clockedIn ? 'إنهاء الدوام' : 'بدء الدوام'}
        </span>
        {clockedIn && currentEntry && (
          <span className="flex items-center gap-1 text-xs font-semibold">
            <Clock size={12} /> {formatElapsed(currentEntry.clock_in)}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      title={clockedIn ? 'إنهاء الدوام' : 'بدء الدوام'}
      className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 transition-colors ${
        clockedIn ? 'bg-pos-success/15 text-pos-success' : 'text-pos-navy-600 hover:bg-pos-navy-800 hover:text-white'
      }`}
    >
      {clockedIn ? <ClockOutIcon size={18} /> : <LogIn size={18} />}
      <span className="text-[9px] font-bold">
        {clockedIn && currentEntry ? (
          <span className="flex items-center gap-0.5">
            <Clock size={9} /> {formatElapsed(currentEntry.clock_in)}
          </span>
        ) : (
          'بدء الدوام'
        )}
      </span>
    </button>
  );
}
