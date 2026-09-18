import { Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CartItem } from '../../types';
import { calculateCartItemPrice, describeModifiers } from '../../utils/calculations';
import { useCartStore } from '../../store/cartStore';
import { CURRENCY } from '../../data/demoData';

interface Props {
  item: CartItem;
  onEdit: (item: CartItem) => void;
}

export default function CartItemRow({ item, onEdit }: Props) {
  const { updateQuantity, removeItem } = useCartStore();
  const { unitPrice, lineTotal } = calculateCartItemPrice(item);
  const { extras, removedBase } = describeModifiers(item);
  const isCustomizable = item.product.modifierGroupIds.length > 0;

  return (
    <div className="rounded-xl border border-pos-border bg-pos-bg/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => isCustomizable && onEdit(item)}
          disabled={!isCustomizable}
          className="min-w-0 flex-1 text-right"
        >
          <p className="text-sm font-bold text-pos-text">
            {item.product.name} <span className="text-pos-text-soft">×{item.quantity}</span>
          </p>
          {extras.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11.5px] text-pos-text-soft">
              {extras.map((e) => (
                <li key={e}>+ {e}</li>
              ))}
            </ul>
          )}
          {removedBase.length > 0 && (
            <p className="mt-1 text-[11.5px] font-semibold text-pos-warning">بدون {removedBase.join('، ')}</p>
          )}
          {item.notes && <p className="mt-1 text-[11.5px] italic text-pos-text-soft">"{item.notes}"</p>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {isCustomizable && (
            <button
              onClick={() => onEdit(item)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-pos-accent hover:bg-pos-accent/10"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            onClick={() => removeItem(item.lineId)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-pos-danger hover:bg-pos-danger/10"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-pos-border bg-pos-surface px-1.5 py-1">
          <button
            onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-pos-bg"
          >
            <Minus size={12} />
          </button>
          <span className="w-4 text-center text-xs font-bold">{item.quantity}</span>
          <button
            onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-pos-bg"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="text-left">
          {item.quantity > 1 && (
            <p className="text-[10.5px] text-pos-text-soft">{unitPrice.toFixed(2)} {CURRENCY} × {item.quantity}</p>
          )}
          <p className="text-sm font-extrabold text-pos-navy-900">{lineTotal.toFixed(2)} {CURRENCY}</p>
        </div>
      </div>
    </div>
  );
}
