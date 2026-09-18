import { useEffect } from 'react';
import { getSocket } from '../services/socket';
import { isPrinterStation } from '../utils/printerStation';
import { usePrintCoordinator } from '../store/printCoordinator';
import type { BroadcastOrder } from '../components/receipt/PrintStationTicket';

/** بتسمع لبث الطلبات اللحظي، وبتطبع بس لو هاد الجهاز محدّد كـ"جهاز الطباعة". بتستخدم منسّق
 * الطباعة المشترك — نفس المكان يلي بتستخدمه شاشة "تم الدفع بنجاح" — حتى مستحيل يصير تصادم
 * (فاتورتين فوق بعض) لو نفس الجهاز هو يلي سجّل الطلب وهو كمان جهاز الطباعة بنفس الوقت */
export function usePrinterStationAutoPrint() {
  const requestPrint = usePrintCoordinator((s) => s.requestPrint);

  useEffect(() => {
    const socket = getSocket();
    function handlePrintOrder(order: BroadcastOrder) {
      if (!isPrinterStation()) return; // مش جهاز الطباعة — تجاهلي البث
      requestPrint({ type: 'broadcast', order });
    }
    socket.on('print-order', handlePrintOrder);
    return () => {
      socket.off('print-order', handlePrintOrder);
    };
  }, [requestPrint]);
}
