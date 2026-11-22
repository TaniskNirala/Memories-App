import React from 'react';
import { Home, CalendarDays, Plus, Users, Shield, Trash2, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

type Tab = 'feed' | 'collections' | 'groups' | 'admin' | 'trash' | 'profile';

interface BottomNavProps {
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOpenUpload: () => void;
}

const ICONS = {
  feed: Home,
  collections: CalendarDays,
  profile: Settings,
  groups: Users,
  admin: Shield,
  trash: Trash2,
} as const;

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab, onOpenUpload }) => {
  const { user, isAdmin, isPending } = useAuth();

  if (!user || isPending) return null;

  const last: { id: Tab; label: string } = { id: 'profile', label: 'Profile' };

  const left: { id: Tab; label: string }[] = [
    { id: 'feed', label: 'Timeline' },
    { id: 'collections', label: 'Events' },
  ];
  const right: { id: Tab; label: string }[] = [{ id: 'groups', label: 'Circles' }, last];

  const renderTab = ({ id, label }: { id: Tab; label: string }) => {
    const active = currentTab === id;
    const Icon = ICONS[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelectTab(id)}
        aria-current={active ? 'page' : undefined}
        className="group relative flex h-full flex-col items-center justify-center gap-1"
      >
        <span
          className={`relative flex h-7 w-11 items-center justify-center rounded-full transition-all duration-200 ${
            active
              ? 'text-[#1d1204] shadow-[0_6px_16px_-8px_rgba(246,169,43,0.9)]'
              : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
          }`}
          style={active ? { background: 'var(--gradient-ember)' } : undefined}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.6 : 2} />
        </span>
        <span
          className={`text-[9.5px] leading-none tracking-tight transition ${
            active ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-safe px-3 lg:hidden transform-gpu">
      <div className="pointer-events-auto mx-auto mb-2 grid h-[62px] max-w-md grid-cols-5 items-center rounded-[26px] border border-[var(--border-color)] bg-[var(--bg-card)]/97 px-1.5 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.8)]">
        {left.map(renderTab)}

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenUpload}
            aria-label="Add a memory"
            className="relative -mt-7 flex h-[54px] w-[54px] items-center justify-center rounded-[19px] text-[#1d1204] transition active:scale-95"
            style={{
              background: 'var(--gradient-ember)',
              boxShadow: '0 10px 26px -12px rgba(246,169,43,0.95), 0 1px 0 rgba(255,255,255,0.5) inset',
            }}
          >
            <span
              aria-hidden
              className="absolute inset-[3px] rounded-[16px] border border-white/25"
            />
            <Plus className="relative h-6 w-6" strokeWidth={3} />
          </button>
        </div>

        {right.map(renderTab)}
      </div>
    </nav>
  );
};
