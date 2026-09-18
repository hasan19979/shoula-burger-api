import { PackageSearch } from 'lucide-react';
import type { Product } from '../../types';
import ProductCard from './ProductCard';

interface Props {
  products: Product[];
  onTapProduct: (product: Product) => void;
}

export default function ProductGrid({ products, onTapProduct }: Props) {
  if (products.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-pos-text-soft">
        <PackageSearch size={34} className="opacity-40" />
        <p className="text-sm">ما في نتائج مطابقة</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onTap={onTapProduct} />
      ))}
    </div>
  );
}
