import { useEffect, useState } from 'react';
import { Users, Plus, Pencil, Trash2, KeyRound, Clock3 } from 'lucide-react';
import { useStaffStore, type StaffRecord } from '../store/staffStore';
import { useAttendanceStore } from '../store/attendanceStore';
import { useAuthStore } from '../store/authStore';
import { ROLE_LABELS } from '../utils/permissions';
import { CURRENCY } from '../data/demoData';
import StaffFormModal from '../components/staff/StaffFormModal';

type Tab = 'staff' | 'attendance';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function calcHours(clockIn: string, clockOut: string | null) {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return Math.max(0, (end - new Date(clockIn).getTime()) / (1000 * 60 * 60));
}

export default function StaffPage() {
  const { staff, fetchStaff, updateStaff, deleteStaff } = useStaffStore();
  const { entries, fetchEntries } = useAttendanceStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [tab, setTab] = useState<Tab>('staff');
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null | undefined>(undefined);
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    if (tab === 'attendance') {
      fetchEntries({ from: `${fromDate}T00:00:00`, to: `${toDate}T23:59:59` });
    }
  }, [tab, fromDate, toDate, fetchEntries]);

  function handleDelete(member: StaffRecord) {
    if (String(member.id) === currentUser?.id) {
      alert('ما تقدري تحذفي حسابك أنتِ بنفسك وإنتِ مسجّلة دخول فيه');
      return;
    }
    if (confirm(`متأكدة من حذف "${member.name}"؟`)) deleteStaff(member.id);
  }

  function toggleActive(member: StaffRecord) {
    updateStaff(member.id, { active: !member.active });
  }

  const totalsByStaff = entries.reduce<Record<string, { hours: number; pay: number; rate: number | null }>>((acc, e) => {
    const hours = calcHours(e.clock_in, e.clock_out);
    const rate = e.hourly_rate !== null ? Number(e.hourly_rate) : null;
    const key = e.staff_name;
    if (!acc[key]) acc[key] = { hours: 0, pay: 0, rate };
    acc[key].hours += hours;
    acc[key].pay += rate ? hours * rate : 0;
    return acc;
  }, {});

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
            <Users size={18} />
            الموظفون
          </h1>
          <div className="flex gap-1 rounded-lg border border-pos-border p-1">
            <button onClick={() => setTab('staff')} className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${tab === 'staff' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}>
              القائمة
            </button>
            <button onClick={() => setTab('attendance')} className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${tab === 'attendance' ? 'bg-pos-accent text-white' : 'text-pos-text-soft'}`}>
              سجل الحضور
            </button>
          </div>
        </div>
        {tab === 'staff' && (
          <button onClick={() => setEditingStaff(null)} className="flex items-center gap-1.5 rounded-lg bg-pos-accent px-3.5 py-2 text-xs font-bold text-white">
            <Plus size={14} /> إضافة موظف
          </button>
        )}
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        {tab === 'staff' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {staff.map((member) => {
              const isMe = String(member.id) === currentUser?.id;
              return (
                <div key={member.id} className={`rounded-2xl border bg-pos-surface p-4 ${member.active ? 'border-pos-border' : 'border-pos-danger/30 opacity-60'}`}>
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-pos-text">
                        {member.name} {isMe && <span className="text-[10px] font-normal text-pos-text-soft">(إنتِ)</span>}
                      </p>
                      <p className="text-xs text-pos-text-soft">{ROLE_LABELS[member.role]}</p>
                      {member.hourly_rate != null && (
                        <p className="text-[11px] text-pos-text-soft">أجر الساعة: {Number(member.hourly_rate).toFixed(2)} {CURRENCY}</p>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${member.active ? 'bg-pos-success/10 text-pos-success' : 'bg-pos-danger/10 text-pos-danger'}`}>
                      {member.active ? 'مفعّل' : 'معطّل'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => setEditingStaff(member)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-pos-border py-2 text-[11px] font-bold text-pos-text">
                      <KeyRound size={12} /> تعديل / رمز جديد
                    </button>
                    {!isMe && (
                      <>
                        <button onClick={() => toggleActive(member)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-border text-pos-text" title={member.active ? 'تعطيل' : 'تفعيل'}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(member)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-pos-danger/30 text-pos-danger">
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'attendance' && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="pos-input w-auto" />
              <span className="text-xs text-pos-text-soft">إلى</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="pos-input w-auto" />
            </div>

            {Object.keys(totalsByStaff).length > 0 && (
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(totalsByStaff).map(([name, t]) => (
                  <div key={name} className="rounded-2xl border border-pos-border bg-pos-surface p-4">
                    <p className="text-sm font-bold text-pos-text">{name}</p>
                    <p className="mt-1 text-xs text-pos-text-soft">{t.hours.toFixed(1)} ساعة</p>
                    {t.rate ? (
                      <p className="mt-1 text-base font-extrabold text-pos-navy-900">{t.pay.toFixed(2)} {CURRENCY}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-pos-warning">ما في أجر ساعة محدد</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-pos-text-soft">
                  <Clock3 size={28} className="opacity-30" />
                  <p className="text-sm">ما في سجلات حضور بهاي الفترة</p>
                </div>
              ) : (
                entries.map((e) => {
                  const hours = calcHours(e.clock_in, e.clock_out);
                  return (
                    <div key={e.id} className="flex items-center justify-between rounded-xl border border-pos-border bg-pos-surface p-3 text-xs">
                      <div>
                        <p className="font-bold text-pos-text">{e.staff_name}</p>
                        <p className="text-pos-text-soft">
                          {new Date(e.clock_in).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                          {' — '}
                          {e.clock_out ? new Date(e.clock_out).toLocaleTimeString('ar-EG', { timeStyle: 'short' }) : 'لسا بالدوام'}
                        </p>
                      </div>
                      <span className="font-bold text-pos-navy-900">{hours.toFixed(1)} س</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {editingStaff !== undefined && <StaffFormModal staff={editingStaff} onClose={() => setEditingStaff(undefined)} />}
    </div>
  );
}
