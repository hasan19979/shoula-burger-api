import { Search } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative">
      <Search size={17} className="absolute end-3.5 top-1/2 -translate-y-1/2 text-pos-text-soft" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="دوّر عن منتج..."
        className="w-full rounded-xl border border-pos-border bg-pos-surface py-3 ps-4 pe-11 text-sm focus:outline-none focus:ring-2 focus:ring-pos-accent"
      />
    </div>
  );
}
