import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { canAccessPage, ROLE_LABELS } from '../../utils/permissions';
import { NAV_ITEMS, type AppPage } from './navItems';
import ClockWidget from './ClockWidget';
import PrinterStationToggle from './PrinterStationToggle';

export type { AppPage };

interface Props {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

/**
 * شريط تنقل جانبي على مستوى التطبيق (Dark Navy) — ظاهر بس من حجم تابلت فما فوق (md:).
 * على الموبايل، التنقل بيصير من MobileNav (شريط سفلي) بدلاً منه.
 */
export default function AppSidebar({ activePage, onNavigate }: Props) {
  const { currentUser, logout } = useAuthStore();
  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.buildable && canAccessPage(currentUser.role, item.id as AppPage)
  );

  return (
    <aside className="hidden md:flex w-20 flex-col items-center gap-2 bg-pos-navy-950 py-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-pos-accent text-white font-bold text-sm">
        ب.ذ
      </div>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activePage;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id as AppPage)}
            title={item.label}
            className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 transition-colors ${
              isActive ? 'bg-pos-accent text-white' : 'text-pos-navy-600 hover:bg-pos-navy-800 hover:text-white'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}

      <ClockWidget />
      <PrinterStationToggle variant="sidebar" />

      <div className="mt-auto flex flex-col items-center gap-2 border-t border-pos-navy-800 pt-3">
        <p className="max-w-16 truncate text-center text-[9px] font-semibold text-pos-navy-600">{currentUser.name}</p>
        <p className="text-[9px] text-pos-navy-700">{ROLE_LABELS[currentUser.role]}</p>
        <button onClick={logout} title="تسجيل خروج" className="flex h-9 w-9 items-center justify-center rounded-lg text-pos-danger hover:bg-pos-navy-800">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
