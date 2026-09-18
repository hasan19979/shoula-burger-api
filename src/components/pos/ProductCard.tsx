import { Plus, ImageOff } from 'lucide-react';
import type { Product } from '../../types';
import { CURRENCY } from '../../data/demoData';

interface Props {
  product: Product;
  onTap: (product: Product) => void;
}

export default function ProductCard({ product, onTap }: Props) {
  return (
    <button
      onClick={() => onTap(product)}
      disabled={!product.available}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-pos-border bg-pos-surface text-right shadow-sm transition-all active:scale-[0.97] ${
        product.available ? 'hover:-translate-y-0.5 hover:shadow-md' : 'opacity-40 grayscale'
      }`}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-pos-bg">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageOff size={26} className="text-pos-text-soft/50" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-sm font-bold leading-tight text-pos-text">{product.name}</h3>
        {product.description && (
          <p className="line-clamp-1 text-[11px] text-pos-text-soft">{product.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <span className="text-sm font-extrabold text-pos-navy-900">
            {product.price} {CURRENCY}
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pos-accent text-white shadow-sm transition-transform group-active:scale-90">
            <Plus size={16} />
          </span>
        </div>
      </div>
      {!product.available && (
        <span className="absolute inset-0 flex items-center justify-center bg-pos-text/60 text-xs font-bold text-white">
          غير متوفر
        </span>
      )}
    </button>
  );
}
