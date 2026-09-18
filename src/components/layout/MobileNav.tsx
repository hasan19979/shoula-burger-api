import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { canAccessPage } from '../../utils/permissions';
import { NAV_ITEMS, MOBILE_PRIMARY_COUNT, type AppPage } from './navItems';
import MobileMoreMenu from './MobileMoreMenu';

interface Props {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
}

export default function MobileNav({ activePage, onNavigate }: Props) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [moreOpen, setMoreOpen] = useState(false);
  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.buildable && canAccessPage(currentUser.role, item.id as AppPage)
  );
  const primaryItems = visibleItems.slice(0, MOBILE_PRIMARY_COUNT);
  const restItems = visibleItems.slice(MOBILE_PRIMARY_COUNT);
  const hasMore = restItems.length > 0;
  // لو الصفحة الحالية من ضمن الشاشات "الإضافية"، لازم نعلّم زر "المزيد" كمفعّل كمان
  const moreIsActive = restItems.some((item) => item.id === activePage);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-pos-border bg-pos-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }}
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activePage;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as AppPage)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 ${isActive ? 'text-pos-accent' : 'text-pos-text-soft'}`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </button>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center justify-center gap-1 ${moreIsActive ? 'text-pos-accent' : 'text-pos-text-soft'}`}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-semibold">المزيد</span>
          </button>
        )}
      </nav>

      {moreOpen && (
        <MobileMoreMenu items={restItems} activePage={activePage} onNavigate={onNavigate} onClose={() => setMoreOpen(false)} />
      )}
    </>
  );
}
