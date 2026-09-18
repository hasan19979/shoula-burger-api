import { useState } from 'react';
import { X, Clock, Users, ArrowLeftRight } from 'lucide-react';
import type { RestaurantTable } from '../../types';
import { useTablesStore } from '../../store/tablesStore';
import { useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';

interface Props {
  table: RestaurantTable;
  allTables: RestaurantTable[];
  onClose: () => void;
  onGoToOrder: () => void;
}

function formatDuration(openedAt?: string) {
  if (!openedAt) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} دقيقة`;
  return `${Math.floor(minutes / 60)} ساعة و${minutes % 60} دقيقة`;
}

export default function TableDetailModal({ table, allTables, onClose, onGoToOrder }: Props) {
  const { openTable, closeTable, markAvailable, transferTable } = useTablesStore();
  const { setOrderType, setTableNumber, clearCart } = useCartStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [partySize, setPartySize] = useState(2);
  const [transferMode, setTransferMode] = useState(false);

  function handleOpen() {
    openTable(table.id, partySize, currentUser?.name ?? 'غير معروف');
    setOrderType('dine-in');
    setTableNumber(table.number);
    clearCart();
    onGoToOrder();
  }

  function handleGoToExistingOrder() {
    setOrderType('dine-in');
    setTableNumber(table.number);
    onGoToOrder();
  }

  function handleClose() {
    if (!confirm(`متأكدة من إغلاق طاولة ${table.number}؟ (لازم يكون الطلب انسدد قبل هيك)`)) return;
    closeTable(table.id);
    onClose();
  }

  const availableTargets = allTables.filter((t) => t.status === 'available' && t.id !== table.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-pos-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-pos-border px-5 py-4">
          <h2 className="text-base font-bold text-pos-text">طاولة {table.number}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-pos-text-soft hover:bg-pos-bg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {table.status === 'available' && (
            <>
              <p className="text-sm text-pos-text-soft">الطاولة فارغة — تقدري تفتحيها بطلب جديد.</p>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-pos-text">عدد الأشخاص</label>
                <input
                  type="number"
                  value={partySize}
                  onChange={(e) => setPartySize(Number(e.target.value) || 1)}
                  min={1}
                  className="w-full rounded-lg border border-pos-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
                />
              </div>
              <button onClick={handleOpen} className="w-full rounded-xl bg-pos-accent py-3 text-sm font-bold text-white">
                فتح الطاولة
              </button>
            </>
          )}

          {table.status === 'occupied' && !transferMode && (
            <>
              <div className="grid grid-cols-2 gap-3 text-center text-sm">
                <div className="rounded-xl bg-pos-bg p-3">
                  <Users size={16} className="mx-auto mb-1 text-pos-text-soft" />
                  <p className="font-bold text-pos-text">{table.partySize ?? '—'} أشخاص</p>
                </div>
                <div className="rounded-xl bg-pos-bg p-3">
                  <Clock size={16} className="mx-auto mb-1 text-pos-text-soft" />
                  <p className="font-bold text-pos-text">{formatDuration(table.openedAt)}</p>
                </div>
              </div>
              <p className="text-xs text-pos-text-soft">الكاشير: {table.cashierName ?? '—'}</p>
              <div className="flex flex-col gap-2">
                <button onClick={handleGoToExistingOrder} className="w-full rounded-xl bg-pos-accent py-3 text-sm font-bold text-white">
                  الذهاب لطلب هاي الطاولة
                </button>
                <button
                  onClick={() => setTransferMode(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-pos-border py-3 text-sm font-bold text-pos-text"
                >
                  <ArrowLeftRight size={15} /> نقل الطاولة
                </button>
                <button onClick={handleClose} className="w-full rounded-xl border border-pos-danger/30 py-3 text-sm font-bold text-pos-danger">
                  إغلاق الطاولة
                </button>
              </div>
            </>
          )}

          {table.status === 'occupied' && transferMode && (
            <>
              <p className="text-sm text-pos-text-soft">نقل جلسة طاولة {table.number} لأي طاولة فارغة:</p>
              {availableTargets.length === 0 ? (
                <p className="text-xs text-pos-danger">ما في طاولات فارغة حالياً</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableTargets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        transferTable(table.id, t.id);
                        onClose();
                      }}
                      className="rounded-xl border border-pos-border bg-pos-bg py-3 text-sm font-bold text-pos-text hover:border-pos-accent"
                    >
                      {t.number}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setTransferMode(false)} className="w-full rounded-xl border border-pos-border py-2.5 text-xs font-semibold text-pos-text-soft">
                رجوع
              </button>
            </>
          )}

          {table.status === 'needs-cleaning' && (
            <>
              <p className="text-sm text-pos-text-soft">الطاولة محتاجة تنظيف قبل ما تصير متاحة من جديد.</p>
              <button
                onClick={() => {
                  markAvailable(table.id);
                  onClose();
                }}
                className="w-full rounded-xl bg-pos-success py-3 text-sm font-bold text-white"
              >
                تحديد كمتاحة
              </button>
            </>
          )}

          {table.status === 'reserved' && (
            <>
              <p className="text-sm text-pos-text-soft">الطاولة محجوزة.</p>
              <button onClick={handleOpen} className="w-full rounded-xl bg-pos-accent py-3 text-sm font-bold text-white">
                فتح الطاولة الآن
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
