import React from 'react';
import { Plus, Users, Sparkles, CalendarDays, Bookmark, X, Camera } from 'lucide-react';
import { Avatar } from './ui/kit.tsx';
import { greeting, accentFromName } from '../lib/format.ts';

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
  selectedGroupIconUrl?: string;
  selectedGroupBannerUrl?: string;
  selectedGroupCanEditImages?: boolean;
  onEditGroupImages?: () => void;
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
  selectedGroupIconUrl,
  selectedGroupBannerUrl,
  selectedGroupCanEditImages,
  onEditGroupImages,
  onOpenUpload,
  onOpenGroupsManager,
  onClearGroup,
  compact = false,
}) => {
  const firstName = user?.displayName?.split(' ')[0] || user?.username || 'friend';
  const memberCount = selectedGroupMembers || 0;
  const circleAccent = selectedGroupName ? accentFromName(selectedGroupName) : undefined;

  const eyebrow = selectedGroupName
    ? `Your circle${memberCount ? ` · ${memberCount} ${memberCount === 1 ? 'person' : 'people'}` : ''}`
    : `${greeting()} · ${new Date().toLocaleDateString([], { weekday: 'long' })}`;

  const subtitle = selectedGroupName
    ? selectedGroupDescription ||
      `Only what ${memberCount ? 'these ' + memberCount + ' people have' : 'this circle has'} shared with each other shows below.`
    : 'Your memories, stacked by the day they happened.';

  if (compact) {
    return (
      <header className="surface relative overflow-hidden p-4">
        {selectedGroupName && selectedGroupBannerUrl && (
          <div className="relative -mx-4 -mt-4 mb-3 aspect-[3/1] w-[calc(100%+2rem)] overflow-hidden border-b border-[var(--border-subtle)] bg-neutral-950">
            <img
              src={selectedGroupBannerUrl}
              alt={`${selectedGroupName} banner`}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
            {selectedGroupCanEditImages && onEditGroupImages && (
              <button
                type="button"
                onClick={onEditGroupImages}
                title="Customize circle banner & icon"
                className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-black/85"
              >
                <Camera className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {selectedGroupName && (
              <Avatar
                name={selectedGroupName}
                color={circleAccent}
                src={selectedGroupIconUrl}
                size={selectedGroupBannerUrl ? 44 : 36}
                ring
                className={selectedGroupBannerUrl ? '-mt-7 border-2 border-[var(--bg-card)] shadow-md' : ''}
              />
            )}
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5">
                {selectedGroupName && !selectedGroupIconUrl && <Users className="h-3 w-3 text-[var(--accent-cyan)]" />}
                {eyebrow}
              </p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-[1.45rem] leading-[1.1] tracking-tight">
                {selectedGroupName ? (
                  <span className="glow-text">{selectedGroupName}</span>
                ) : (
                  <>
                    Hello, <span className="glow-text">{firstName}</span>
                  </>
                )}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {selectedGroupName && !selectedGroupBannerUrl && selectedGroupCanEditImages && onEditGroupImages && (
              <button
                type="button"
                onClick={onEditGroupImages}
                title="Customize circle banner & icon"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]/70 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
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
          </div>
        </div>
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-4">
      <section className="surface relative shrink-0 overflow-hidden p-4">
        {selectedGroupName && selectedGroupBannerUrl ? (
          <div className="relative -mx-4 -mt-4 mb-2 aspect-[3/1] w-[calc(100%+2rem)] overflow-hidden border-b border-[var(--border-subtle)] bg-neutral-950">
            <img
              src={selectedGroupBannerUrl}
              alt={`${selectedGroupName} banner`}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15" />
            {selectedGroupCanEditImages && onEditGroupImages && (
              <button
                type="button"
                onClick={onEditGroupImages}
                title="Customize circle banner & icon"
                className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/20 bg-black/65 px-2 py-0.5 text-[9.5px] font-semibold text-white transition hover:bg-black/85"
              >
                <Camera className="h-2.5 w-2.5" /> Edit
              </button>
            )}
          </div>
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl"
            style={{ background: 'var(--gradient-ember)' }}
          />
        )}

        {selectedGroupName ? (
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar
                name={selectedGroupName}
                color={circleAccent}
                src={selectedGroupIconUrl}
                size={selectedGroupBannerUrl ? 44 : 36}
                ring
                className={selectedGroupBannerUrl ? '-mt-7 relative z-10 border-2 border-[var(--bg-card)] shadow-md' : ''}
              />
              <div className="min-w-0">
                <p className="eyebrow flex items-center gap-1.5">
                  {!selectedGroupIconUrl && <Users className="h-2.5 w-2.5 text-[var(--accent-cyan)]" />}
                  {eyebrow}
                </p>
                <h1 className="mt-1 truncate font-display text-[1.25rem] leading-[1.12] tracking-tight">
                  <span className="glow-text">{selectedGroupName}</span>
                </h1>
              </div>
            </div>

            {!selectedGroupBannerUrl && selectedGroupCanEditImages && onEditGroupImages && (
              <button
                type="button"
                onClick={onEditGroupImages}
                title="Customize circle banner & icon"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="eyebrow flex items-center gap-1.5">{eyebrow}</p>
            <h1 className="mt-1.5 font-display text-[1.35rem] leading-[1.12] tracking-tight">
              Hello, <span className="glow-text">{firstName}</span>
            </h1>
          </>
        )}
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
          <Avatar name={user?.displayName || user?.username} color={user?.avatarColor} src={user?.avatarUrl} size={28} ring />
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
