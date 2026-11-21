import React, { useRef } from 'react';
import { Home, CalendarDays, Users, Shield, Trash2, Sparkles, Plus, Compass, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Group } from '../types/index.ts';
import { Avatar } from './ui/kit.tsx';
import { accentFromName } from '../lib/format.ts';

export type Tab = 'feed' | 'collections' | 'groups' | 'admin' | 'trash' | 'profile';

interface SideNavProps {
  currentTab: Tab;
  onSelectTab: (tab: Tab) => void;
  onOpenUpload: () => void;
  groups: Group[];
  selectedGroupId?: string;
  onSelectGroup: (groupId: string | undefined) => void;
  onOpenCreateGroup: () => void;
  onOpenGroupsManager: () => void;
  feedCount: number;
  eventCount: number;
}

/* Profile is reachable from the header avatar and the phone tab bar, so the
   desktop rail stays focused on content (it is not listed here on purpose). */
const NAV_ICONS = {
  feed: Home,
  collections: CalendarDays,
  groups: Users,
  admin: Shield,
  trash: Trash2,
} as const;

export const SideNav: React.FC<SideNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenUpload,
  groups,
  selectedGroupId,
  onSelectGroup,
  onOpenCreateGroup,
  onOpenGroupsManager,
  feedCount,
  eventCount,
}) => {
  const { user, isAdmin } = useAuth();
  const circlesListRef = useRef<HTMLDivElement>(null);

  const handleAsideWheel = (e: React.WheelEvent<HTMLElement>) => {
    const listEl = circlesListRef.current;
    if (!listEl) return;
    // If the wheel event already originated inside the scrollable circles list,
    // let native scrolling + overscroll-contain handle it directly.
    if (listEl.contains(e.target as Node)) return;
    // If the user scrolls over non-scrollable parts of the left rail while
    // there are overflow circles, scroll ONLY the left rail's circles list.
    if (listEl.scrollHeight > listEl.clientHeight) {
      listEl.scrollTop += e.deltaY;
    }
  };

  const items: { id: Tab; label: string; count?: number; hint: string }[] = [
    { id: 'feed', label: 'Timeline', count: feedCount, hint: 'Every memory, one rail' },
    { id: 'collections', label: 'Events', count: eventCount, hint: 'Trips & celebrations' },
    { id: 'groups', label: 'Circles', count: groups.length, hint: 'Who sees what' },
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Admin studio', hint: 'People, reports, audit' }] : []),
    { id: 'trash', label: 'Trash', hint: 'Recover for 30 days' },
  ];

  return (
    <aside
      onWheel={handleAsideWheel}
      className="hidden w-[210px] shrink-0 overscroll-contain lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-3 pb-4">
        {/* Primary navigation */}
        <nav className="surface shrink-0 overflow-hidden p-1.5">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.id as keyof typeof NAV_ICONS];
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition ${
                  active ? 'bg-[var(--bg-surface-elevated)]' : 'hover:bg-[var(--bg-surface)]'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                    style={{ background: 'var(--gradient-ember)' }}
                  />
                )}
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border transition ${
                    active
                      ? 'border-transparent text-[#1d1204]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                  }`}
                  style={active ? { background: 'var(--gradient-ember)' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[11.5px] font-semibold leading-tight ${
                      active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="mt-px block truncate text-[8.5px] leading-tight text-[var(--text-muted)]">{item.hint}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span className="shrink-0 rounded-full bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Circles */}
        <section className="surface flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between px-2.5 pb-1 pt-2.5">
            <h2 className="eyebrow">Your circles</h2>
            <button
              type="button"
              onClick={onOpenCreateGroup}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--accent-amber)]"
              title="Create a circle"
              aria-label="Create a circle"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            ref={circlesListRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5"
          >
            <button
              type="button"
              onClick={() => onSelectGroup(undefined)}
              className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition ${
                selectedGroupId === undefined ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/70'
              }`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#141008]"
                style={{ background: 'var(--gradient-mint)' }}
              >
                <Compass className="h-3 w-3" strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold leading-tight">All circles</span>
                <span className="block truncate text-[8.5px] leading-tight text-[var(--text-muted)]">Everything you can see</span>
              </span>
              {selectedGroupId === undefined && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
              )}
            </button>

            {groups.map((g) => {
              const active = selectedGroupId === g.id;
              const accent = accentFromName(g.name);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelectGroup(g.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                    active ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]/70'
                  }`}
                >
                  <span className="relative">
                    <Avatar name={g.name} color={accent} size={24} />
                    {g.isEveryone && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--bg-card)] bg-[var(--accent-teal)]">
                        <Sparkles className="h-2 w-2 text-[#04120c]" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold leading-tight">{g.name}</span>
                    <span className="block truncate text-[8.5px] leading-tight text-[var(--text-muted)]">
                      {g.members?.length || g.memberCount} member{(g.members?.length || g.memberCount) === 1 ? '' : 's'}
                    </span>
                  </span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenGroupsManager}
            className="flex w-full shrink-0 items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-2.5 py-2 text-[10px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <KeyRound className="h-3 w-3 shrink-0" /> <span className="truncate">Manage members &amp; rules</span>
            </span>
            <span aria-hidden>→</span>
          </button>
        </section>

        {/* Upload CTA */}
        <button type="button" onClick={onOpenUpload} className="btn btn-primary btn-block shrink-0 !rounded-xl !py-2.5 !text-[11.5px]">
          <Plus className="h-4 w-4" strokeWidth={3} />
          Add a memory
        </button>

        {user?.role === 'admin' && (
          <p className="shrink-0 px-1 text-[9.5px] leading-relaxed text-[var(--text-muted)]">
            Signed in as admin — visibility overrides and audit trails are in Admin studio.
          </p>
        )}
      </div>
    </aside>
  );
};
