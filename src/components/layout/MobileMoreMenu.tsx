import { X, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ROLE_LABELS } from '../../utils/permissions';
import type { NavItem, AppPage } from './navItems';
import ClockWidget from './ClockWidget';
import PrinterStationToggle from './PrinterStationToggle';

interface Props {
  items: NavItem[];
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onClose: () => void;
}

export default function MobileMoreMenu({ items, activePage, onNavigate, onClose }: Props) {
  const { currentUser, logout } = useAuthStore();
  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:hidden" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-pos-surface pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-pos-border px-5 py-4">
          <div>
            <p className="text-sm font-bold text-pos-text">{currentUser.name}</p>
            <p className="text-xs text-pos-text-soft">{ROLE_LABELS[currentUser.role]}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-pos-text-soft hover:bg-pos-bg">
            <X size={18} />
          </button>
        </div>

        <div className="pos-scroll overflow-y-auto p-4">
          {items.length > 0 && (
            <div className="mb-4 grid grid-cols-4 gap-3">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activePage;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id as AppPage);
                      onClose();
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-center ${
                      isActive ? 'border-pos-accent bg-pos-accent/10 text-pos-accent' : 'border-pos-border text-pos-text'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <ClockWidget variant="sheet" />
            <PrinterStationToggle variant="sheet" />
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-pos-danger/30 py-3 text-sm font-bold text-pos-danger"
            >
              <LogOut size={16} /> تسجيل خروج
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
