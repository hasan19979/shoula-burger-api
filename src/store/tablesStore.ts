import { create } from 'zustand';
import type { RestaurantTable, TableStatus } from '../types';

function makeDefaultTables(): RestaurantTable[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `table-${i + 1}`,
    number: String(i + 1),
    seats: [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 2, 8][i] ?? 4,
    status: 'available' as TableStatus,
  }));
}

interface TablesState {
  tables: RestaurantTable[];
  openTable: (tableId: string, partySize: number, cashierName: string) => void;
  closeTable: (tableId: string) => void;
  markNeedsCleaning: (tableId: string) => void;
  markAvailable: (tableId: string) => void;
  transferTable: (fromTableId: string, toTableId: string) => void;
  reserveTable: (tableId: string) => void;
}

export const useTablesStore = create<TablesState>((set) => ({
  tables: makeDefaultTables(),

  openTable: (tableId, partySize, cashierName) =>
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId
          ? { ...t, status: 'occupied', partySize, openedAt: new Date().toISOString(), cashierName }
          : t
      ),
    })),

  closeTable: (tableId) =>
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, status: 'available', partySize: undefined, openedAt: undefined, cashierName: undefined } : t
      ),
    })),

  markNeedsCleaning: (tableId) =>
    set((state) => ({
      tables: state.tables.map((t) =>
        t.id === tableId ? { ...t, status: 'needs-cleaning', partySize: undefined, openedAt: undefined } : t
      ),
    })),

  markAvailable: (tableId) =>
    set((state) => ({
      tables: state.tables.map((t) => (t.id === tableId ? { ...t, status: 'available' } : t)),
    })),

  transferTable: (fromTableId, toTableId) =>
    set((state) => {
      const from = state.tables.find((t) => t.id === fromTableId);
      if (!from) return state;
      return {
        tables: state.tables.map((t) => {
          if (t.id === toTableId) return { ...from, id: toTableId, number: t.number };
          if (t.id === fromTableId) return { ...t, status: 'available', partySize: undefined, openedAt: undefined, cashierName: undefined };
          return t;
        }),
      };
    }),

  reserveTable: (tableId) =>
    set((state) => ({
      tables: state.tables.map((t) => (t.id === tableId ? { ...t, status: 'reserved' } : t)),
    })),
}));

/** بيحسب مين الطاولة المرتبطة برقم طاولة معيّن (متل اللي مكتوب بسلة الطلب الحالية) */
export function findTableByNumber(tables: RestaurantTable[], tableNumber: string | null) {
  if (!tableNumber) return null;
  return tables.find((t) => t.number === tableNumber) ?? null;
}
