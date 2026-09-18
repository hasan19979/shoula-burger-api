import { create } from 'zustand';
import type { Discount, ItemAssignment, Person, SplitMethod, SplitPayment } from '../types';

interface CheckoutState {
  discount: Discount | null;
  splitMethod: SplitMethod;
  people: Person[];
  assignments: ItemAssignment[];

  setDiscount: (discount: Discount | null) => void;
  setSplitMethod: (method: SplitMethod) => void;
  setPeopleCount: (count: number) => void;
  assignItem: (lineId: string, personId: string, quantity: number) => void;
  unassignItem: (lineId: string, personId: string) => void;
  setManualAmount: (personId: string, amount: number) => void;
  addPayment: (personId: string, payment: SplitPayment) => void;
  resetCheckout: () => void;
}

function makePeople(count: number): Person[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `person-${i + 1}`,
    label: `الشخص ${i + 1}`,
    payments: [],
  }));
}

export const useCheckoutStore = create<CheckoutState>((set) => ({
  discount: null,
  splitMethod: 'by-person',
  people: [],
  assignments: [],

  setDiscount: (discount) => set({ discount }),
  setSplitMethod: (splitMethod) => set({ splitMethod }),

  setPeopleCount: (count) =>
    set((state) => {
      const safeCount = Math.max(1, count);
      if (safeCount === state.people.length) return state;
      if (safeCount > state.people.length) {
        const extra = makePeople(safeCount - state.people.length).map((p, i) => ({
          ...p,
          id: `person-${state.people.length + i + 1}`,
          label: `الشخص ${state.people.length + i + 1}`,
        }));
        return { people: [...state.people, ...extra] };
      }
      const keptIds = new Set(state.people.slice(0, safeCount).map((p) => p.id));
      return {
        people: state.people.slice(0, safeCount),
        assignments: state.assignments.filter((a) => keptIds.has(a.personId)),
      };
    }),

  assignItem: (lineId, personId, quantity) =>
    set((state) => {
      const existing = state.assignments.find((a) => a.lineId === lineId && a.personId === personId);
      if (existing) {
        return {
          assignments: state.assignments.map((a) =>
            a.lineId === lineId && a.personId === personId ? { ...a, quantity } : a
          ),
        };
      }
      return { assignments: [...state.assignments, { lineId, personId, quantity }] };
    }),

  unassignItem: (lineId, personId) =>
    set((state) => ({
      assignments: state.assignments.filter((a) => !(a.lineId === lineId && a.personId === personId)),
    })),

  setManualAmount: (personId, amount) =>
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? { ...p, manualAmount: amount } : p)),
    })),

  addPayment: (personId, payment) =>
    set((state) => ({
      people: state.people.map((p) => (p.id === personId ? { ...p, payments: [...p.payments, payment] } : p)),
    })),

  resetCheckout: () => set({ discount: null, splitMethod: 'by-person', people: [], assignments: [] }),
}));
