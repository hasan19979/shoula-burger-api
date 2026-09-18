import { useState } from 'react';
import { LayoutGrid, Users } from 'lucide-react';
import { useTablesStore } from '../store/tablesStore';
import type { RestaurantTable, TableStatus } from '../types';
import TableDetailModal from '../components/tables/TableDetailModal';

const STATUS_STYLES: Record<TableStatus, string> = {
  available: 'border-pos-success bg-pos-success/10 text-pos-success',
  occupied: 'border-pos-danger bg-pos-danger/10 text-pos-danger',
  reserved: 'border-pos-warning bg-pos-warning/10 text-pos-warning',
  'needs-cleaning': 'border-pos-text-soft/40 bg-pos-text-soft/10 text-pos-text-soft',
};
const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'فارغة',
  occupied: 'مشغولة',
  reserved: 'محجوزة',
  'needs-cleaning': 'بحاجة تنظيف',
};
const STATUS_DOT: Record<TableStatus, string> = {
  available: 'bg-pos-success',
  occupied: 'bg-pos-danger',
  reserved: 'bg-pos-warning',
  'needs-cleaning': 'bg-pos-text-soft',
};

interface Props {
  onGoToOrder: () => void;
}

export default function TablesPage({ onGoToOrder }: Props) {
  const { tables } = useTablesStore();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-pos-border bg-pos-surface px-4 md:px-6">
        <h1 className="flex items-center gap-2 text-sm font-bold text-pos-text">
          <LayoutGrid size={18} />
          الطاولات
        </h1>
        <div className="flex gap-3 text-[11px] text-pos-text-soft">
          {(Object.keys(STATUS_LABEL) as TableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </header>

      <div className="pos-scroll flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border-2 transition-transform active:scale-95 ${STATUS_STYLES[table.status]}`}
            >
              <span className="text-xl font-extrabold">{table.number}</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold">
                <Users size={10} /> {table.seats}
              </span>
              <span className="text-[10px] font-bold">{STATUS_LABEL[table.status]}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedTable && (
        <TableDetailModal
          table={tables.find((t) => t.id === selectedTable.id) ?? selectedTable}
          allTables={tables}
          onClose={() => setSelectedTable(null)}
          onGoToOrder={() => {
            setSelectedTable(null);
            onGoToOrder();
          }}
        />
      )}
    </div>
  );
}
