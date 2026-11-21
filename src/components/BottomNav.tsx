import React from 'react';
import { Home, CalendarDays, Plus, Users, Shield, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

type Tab = 'feed' | 'collections' | 'groups' | 'admin' | 'trash';

interface BottomNavProps {
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOpenUpload: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab, onOpenUpload }) => {
  const { user, isAdmin, isPending } = useAuth();

  if (!user || isPending) return null;

  const lastTab: { id: Tab; label: string; Icon: typeof Shield } = isAdmin
    ? { id: 'admin', label: 'Admin', Icon: Shield }
    : { id: 'trash', label: 'Trash', Icon: Trash2 };

  const tabs: { id: Tab; label: string; Icon: typeof Home }[] = [
    { id: 'feed', label: 'Stream', Icon: Home },
    { id: 'collections', label: 'Events', Icon: CalendarDays },
  ];
  const rightTabs: { id: Tab; label: string; Icon: typeof Home }[] = [
    { id: 'groups', label: 'Circles', Icon: Users },
    lastTab,
  ];

  const renderTab = ({ id, label, Icon }: { id: Tab; label: string; Icon: typeof Home }) => {
    const active = currentTab === id;
    return (
      <button
        key={id}
        onClick={() => onSelectTab(id)}
        aria-current={active ? 'page' : undefined}
        className="group flex flex-col items-center justify-center w-full h-full gap-0.5 transition"
      >
        <span
          className={`flex items-center justify-center w-10 h-7 rounded-full transition-all ${
            active
              ? 'bg-[var(--accent-amber)] text-[#1e2142] shadow-sm scale-105'
              : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.5 : 2} />
        </span>
        <span className={`text-[10px] tracking-tight ${active ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none pb-safe px-3 sm:pb-4">
      <div className="pointer-events-auto max-w-md mx-auto grid grid-cols-5 items-center h-16 px-2 rounded-[28px] border-2 border-[var(--border-color)] bg-[var(--bg-card)]/90 backdrop-blur-xl shadow-[0_10px_0_var(--sticker),0_18px_40px_-16px_rgba(0,0,0,0.5)]">
        {tabs.map(renderTab)}

        <div className="flex items-center justify-center -mt-7">
          <button
            onClick={onOpenUpload}
            aria-label="Upload Memory"
            className="w-14 h-14 rounded-[20px] rotate-3 bg-gradient-to-tr from-amber-400 to-rose-500 text-white flex items-center justify-center border-4 border-[var(--bg-page)] playful-btn"
          >
            <Plus className="w-7 h-7" strokeWidth={3} />
          </button>
        </div>

        {rightTabs.map(renderTab)}
      </div>
    </nav>
  );
};
