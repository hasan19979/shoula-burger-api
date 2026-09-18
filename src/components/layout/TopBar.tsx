import { useEffect, useRef, useState } from 'react';
import { Store, ChevronDown, Wifi, WifiOff, RefreshCw, Check } from 'lucide-react';
import { useCartStore } from '../../store/cartStore';
import { RESTAURANT_NAME } from '../../data/demoData';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import type { OrderType } from '../../types';

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  'dine-in': 'داخل المطعم',
  takeaway: 'سفري',
  delivery: 'توصيل',
  pickup: 'استلام',
};

// "استلام" و"سفري" نفس الشي عملياً — بنعرض "سفري" بس بقائمة الاختيار
const SELECTABLE_ORDER_TYPES: OrderType[] = ['dine-in', 'takeaway', 'delivery'];

function ConnectionBadge() {
  const { isOnline, pendingCount, syncing } = useConnectionStatus();

  if (syncing) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-pos-accent/10 px-3 py-1.5 text-xs font-bold text-pos-accent">
        <RefreshCw size={13} className="animate-spin" /> جاري المزامنة...
      </span>
    );
  }
  if (!isOnline || pendingCount > 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-pos-warning/10 px-3 py-1.5 text-xs font-bold text-pos-warning">
        <WifiOff size={13} />
        {!isOnline ? 'بدون اتصال' : `${pendingCount} طلب بانتظار الإرسال`}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-pos-success/10 px-3 py-1.5 text-xs font-bold text-pos-success">
      <Wifi size={13} /> متصل
    </span>
  );
}

export default function TopBar() {
  const { orderType, setOrderType, tableNumber, setTableNumber } = useCartStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // بنحسب مكان الزر بالضبط على الشاشة (مش بنعتمد على "أب نسبي" بالصفحة) — هيك القائمة
  // بتنرسم بمكانها الصح دايماً، بغض النظر عن أي تعقيد بعناصر الصفحة المحيطة فيها
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  function handleToggle() {
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setMenuOpen((v) => !v);
  }

  // سكّري القائمة لو صار كليك برّاها
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pos-navy-900 text-white">
          <Store size={18} />
        </div>
        <div>
          <h1 className="text-sm font-bold text-pos-text">{RESTAURANT_NAME}</h1>
          <p className="text-[11px] text-pos-text-soft">شاشة الكاشير</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ConnectionBadge />

        {orderType === 'dine-in' && (
          <input
            type="text"
            value={tableNumber ?? ''}
            onChange={(e) => setTableNumber(e.target.value || null)}
            placeholder="رقم الطاولة"
            className="w-28 rounded-lg border border-pos-border bg-pos-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
          />
        )}

        <button
          ref={buttonRef}
          onClick={handleToggle}
          className="flex items-center gap-2 rounded-lg border border-pos-border bg-pos-bg px-3.5 py-2 text-sm font-semibold text-pos-text"
        >
          {ORDER_TYPE_LABELS[orderType]}
          <ChevronDown size={15} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {menuOpen && menuPos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="z-[100] w-40 overflow-hidden rounded-lg border border-pos-border bg-pos-surface shadow-2xl"
        >
          {SELECTABLE_ORDER_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => {
                setOrderType(type);
                setMenuOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3.5 py-2.5 text-right text-sm hover:bg-pos-bg ${
                type === orderType ? 'font-bold text-pos-accent' : 'text-pos-text'
              }`}
            >
              {ORDER_TYPE_LABELS[type]}
              {type === orderType && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
