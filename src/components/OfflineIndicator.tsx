import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/35 bg-[var(--bg-card)]/95 px-3.5 py-2 text-[11px] font-semibold text-[var(--accent-amber)] shadow-[var(--shadow-float)] backdrop-blur-xl lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline — showing cached memories</span>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-amber)]" />
    </div>
  );
};
