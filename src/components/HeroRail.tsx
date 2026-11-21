import React from 'react';
import { Plus, Users, Sparkles, CalendarDays, Bookmark, X } from 'lucide-react';
import { Avatar } from './ui/kit.tsx';
import { greeting } from '../lib/format.ts';

/* ---------------------------------------------------------------------------
   Hero rail — the "where am I" panel.

   On desktop it sits in the right-hand gutter of the feed, mirroring the left
   navigation rail so the timeline itself reads as perfectly centred. On phones
   the same component renders `compact` above the search bar.
   --------------------------------------------------------------------------- */

export interface HeroRailProps {
  user: any;
  groupsCount: number;
  memories: number;
  contributors: number;
  selectedGroupName?: string;
  selectedGroupDescription?: string;
  selectedGroupMembers?: number;
  onOpenUpload: () => void;
  onOpenGroupsManager: () => void;
  /** Clears the circle filter and returns to the full timeline */
  onClearGroup?: () => void;
  compact?: boolean;
}

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 px-2 py-1.5">
    <p className="font-display text-[15px] leading-none tabular-nums">{value}</p>
    <p className="mt-1 text-[7.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
      {label}
    </p>
  </div>
);

export const HeroRail: React.FC<HeroRailProps> = ({
  user,
  groupsCount,
  memories,
  contributors,
  selectedGroupName,
  selectedGroupDescription,
  selectedGroupMembers,
  onOpenUpload,
  onOpenGroupsManager,
  onClearGroup,
  compact = false,
}) => {
  const firstName = user?.displayName?.split(' ')[0] || user?.username || 'friend';
  const memberCount = selectedGroupMembers || 0;

  const eyebrow = selectedGroupName
    ? `Your circle${memberCount ? ` · ${memberCount} ${memberCount === 1 ? 'person' : 'people'}` : ''}`
    : `${greeting()} · ${new Date().toLocaleDateString([], { weekday: 'long' })}`;

  const subtitle = selectedGroupName
    ? selectedGroupDescription ||
      `Only what ${memberCount ? 'these ' + memberCount + ' people have' : 'this circle has'} shared with each other shows below.`
    : 'Your memories, stacked by the day they happened.';

  if (compact) {
    return (
      <header className="relative overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-card)]/80 p-4 backdrop-blur-xl">
        <p className="eyebrow flex items-center gap-1.5">
          {selectedGroupName && <Users className="h-3 w-3 text-[var(--accent-cyan)]" />}
          {eyebrow}
        </p>
        <h1 className="mt-1.5 flex flex-wrap items-center gap-2 font-display text-[1.5rem] leading-[1.1] tracking-tight">
          {selectedGroupName ? (
            <span className="glow-text">{selectedGroupName}</span>
          ) : (
            <>
              Hello, <span className="glow-text">{firstName}</span>
            </>
          )}
          {selectedGroupName && onClearGroup && (
            <button
              type="button"
              onClick={onClearGroup}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/70 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <X className="h-2.5 w-2.5" /> All circles
            </button>
          )}
        </h1>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            <Stat value={memories} label="memories" />
            <Stat value={groupsCount} label="circles" />
            <Stat value={contributors} label="people" />
          </div>
          <button type="button" onClick={onOpenUpload} className="btn btn-primary !px-3 !py-2.5">
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <div className="sticky top-[76px] space-y-3 pb-8">
      <section className="surface relative overflow-hidden p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl"
          style={{ background: 'var(--gradient-ember)' }}
        />

        <p className="eyebrow flex items-center gap-1.5">
          {selectedGroupName && <Users className="h-2.5 w-2.5 text-[var(--accent-cyan)]" />}
          {eyebrow}
        </p>
        <h1 className="mt-1.5 font-display text-[1.35rem] leading-[1.12] tracking-tight">
          {selectedGroupName ? (
            <span className="glow-text">{selectedGroupName}</span>
          ) : (
            <>
              Hello, <span className="glow-text">{firstName}</span>
            </>
          )}
        </h1>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>

        {selectedGroupName && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {onClearGroup && (
              <button
                type="button"
                onClick={onClearGroup}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/70 px-2 py-1 text-[9.5px] font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-amber)]/50 hover:text-[var(--text-primary)]"
              >
                <X className="h-2.5 w-2.5" /> Leave filter
              </button>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[9.5px] font-semibold text-[var(--text-muted)]">
              <Sparkles className="h-2.5 w-2.5 text-[var(--accent-amber)]" /> private to this circle
            </span>
          </div>
        )}

        {/* who you are */}
        <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-2 py-1.5">
          <Avatar name={user?.displayName || user?.username} color={user?.avatarColor} size={28} ring />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[10.5px] font-bold">@{user?.username}</p>
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {user?.role}
            </p>
          </div>
        </div>

        {/* quick numbers */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Stat value={memories} label="memories" />
          <Stat value={groupsCount} label="circles" />
          <Stat value={contributors} label="people" />
        </div>

        <button type="button" onClick={onOpenUpload} className="btn btn-primary btn-block mt-3 !rounded-xl !py-2.5">
          <Plus className="h-4 w-4" strokeWidth={2.8} />
          Add memory
        </button>
      </section>

      {/* quick jumps */}
      <section className="surface overflow-hidden">
        <p className="eyebrow px-3 pt-3">Jump to</p>
        <div className="p-1.5">
          <button
            type="button"
            onClick={onOpenGroupsManager}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--bg-surface)]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--accent-cyan)]">
              <Users className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">Circles &amp; rules</span>
          </button>
          <button
            type="button"
            onClick={onOpenGroupsManager}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--bg-surface)]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--accent-coral)]">
              <CalendarDays className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">Upcoming events</span>
          </button>
          <button
            type="button"
            onClick={onOpenGroupsManager}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--bg-surface)]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--accent-amber)]">
              <Bookmark className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">Saved views</span>
          </button>
        </div>
      </section>

      <p className="flex items-center gap-1.5 px-1 text-[9px] leading-relaxed text-[var(--text-muted)]">
        <Sparkles className="h-3 w-3 shrink-0 text-[var(--accent-amber)]" />
        Signed in as {user?.role} — press ⌘K to jump anywhere.
      </p>
    </div>
  );
};
