import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

/** نغمة تنبيه بسيطة مبنية بالكود مباشرة (Web Audio API) — بدون ملف صوت خارجي نحتاج نحمّله */
function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [0, 0.18].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.17);
    });
  } catch {
    // بعض المتصفحات بتمنع الصوت قبل أول تفاعل من المستخدم بالصفحة — نتجاهل الخطأ بهدوء
  }
}

/** بتشترك بحدث "new-order" اللحظي من السيرفر، وبتنده onNewOrder + تشغّل نغمة تنبيه فور وصول طلب جديد */
export function useRealtimeNewOrder(onNewOrder: () => void) {
  const callbackRef = useRef(onNewOrder);
  callbackRef.current = onNewOrder;

  useEffect(() => {
    const socket = getSocket();
    function handleNewOrder() {
      playAlertTone();
      callbackRef.current();
    }
    socket.on('new-order', handleNewOrder);
    return () => {
      socket.off('new-order', handleNewOrder);
    };
  }, []);
}
