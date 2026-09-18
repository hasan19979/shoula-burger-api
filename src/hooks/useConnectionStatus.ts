import { useEffect, useState } from 'react';
import { useOfflineQueueStore } from '../store/offlineQueueStore';

export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { pending, syncing, syncPending } = useOfflineQueueStore();

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      syncPending();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // نحاول كل 20 ثانية حتى لو حدث "online" ما انطلق (بيصير أحياناً إن الشبكة المحلية شغالة
    // بس السيرفر نفسه ما وصلنا، فمتصفح ما بيعتبرها "offline" رسمياً)
    const interval = setInterval(() => {
      if (navigator.onLine) syncPending();
    }, 20000);

    // محاولة أولى فور فتح التطبيق لو في طلبات معلّقة من قبل
    if (navigator.onLine) syncPending();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, pendingCount: pending.length, syncing };
}
