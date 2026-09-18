import { create } from 'zustand';
import type { CartItem, CompletedPayment, OrderType } from '../types';
import type { BroadcastOrder } from '../components/receipt/PrintStationTicket';

type PrintJob =
  | {
      type: 'payment';
      payment: CompletedPayment;
      items: CartItem[];
      orderType: OrderType;
      tableNumber: string | null;
      customerName?: string;
      customerPhone?: string;
      deliveryAddress?: string;
    }
  | { type: 'broadcast'; order: BroadcastOrder }
  | null;

interface PrintCoordinatorState {
  job: PrintJob;
  /** بتحط الفاتورة المطلوبة كمهمة الطباعة **الوحيدة** الحالية، وبعد شوي (حتى يترسم الـDOM) بتطبع.
   * أي طلب طباعة تاني بيستبدل هاد بالكامل — مستحيل يصير فاتورتين بنفس اللحظة، لأنه القيمة واحدة بس دايماً. */
  requestPrint: (job: NonNullable<PrintJob>) => void;
}

export const usePrintCoordinator = create<PrintCoordinatorState>((set) => ({
  job: null,
  requestPrint: (job) => {
    set({ job });
    setTimeout(() => window.print(), 80);
  },
}));
