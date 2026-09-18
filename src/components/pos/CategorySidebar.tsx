import * as Icons from 'lucide-react';
import { useCategoriesStore } from '../../store/categoriesStore';

interface Props {
  activeCategory: string;
  onSelect: (categoryId: string) => void;
}

export default function CategorySidebar({ activeCategory, onSelect }: Props) {
  const categories = useCategoriesStore((s) => s.categories);
  return (
    <nav
      className="pos-scroll flex shrink-0 gap-1.5 overflow-x-auto overflow-y-hidden border-b border-pos-border bg-pos-surface p-2.5
                 md:w-28 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-s"
    >
      {categories.map((cat) => {
        // @ts-expect-error - lucide-react exports icons dynamically by name
        const Icon = Icons[cat.icon] ?? Icons.Circle;
        const isActive = activeCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`flex shrink-0 flex-row items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-center transition-colors
                        md:flex-col md:gap-1.5 md:whitespace-normal md:px-2 md:py-3 ${
              isActive ? 'bg-pos-accent text-white' : 'bg-pos-bg text-pos-text-soft hover:bg-pos-border/60'
            }`}
          >
            <Icon size={20} />
            <span className="text-[11px] font-semibold leading-tight">{cat.name}</span>
          </button>
        );
      })}
    </nav>
  );
}
