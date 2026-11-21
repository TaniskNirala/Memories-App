import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  MapPin,
  Users,
  Images,
  Plus,
  Sparkles,
  ArrowUpRight,
  MessageSquare,
  Layers,
  Search,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { FeedItem, Group } from '../types/index.ts';
import { Avatar, Badge, EmptyState, SearchBox, StatTile, Dot, PageHero } from './ui/kit.tsx';
import { dayNumber, monthShort, shortDate, plural } from '../lib/format.ts';

type CollectionCard = Extract<FeedItem, { type: 'collection_card' }>;

interface EventsPageProps {
  items: FeedItem[];
  groups: Group[];
  onOpenCollection: (id: string) => void;
  onOpenComments: (item: FeedItem) => void;
  onPropose: () => void;
  onOpenUpload: () => void;
}

export const EventsPage: React.FC<EventsPageProps> = ({
  items,
  groups,
  onOpenCollection,
  onOpenComments,
  onPropose,
  onOpenUpload,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'events' | 'collections' | 'attended'>('all');
  const [sort, setSort] = useState<'recent' | 'oldest' | 'biggest'>('recent');

  const collections = useMemo(
    () => items.filter((i): i is CollectionCard => i.type === 'collection_card'),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = collections.filter((c) => {
      if (filter === 'events' && !c.isEvent) return false;
      if (filter === 'collections' && c.isEvent) return false;
      if (filter === 'attended' && !c.userAttended) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.eventPlace || '').toLowerCase().includes(q) ||
        c.creator.displayName.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sort === 'biggest') return b.itemCount - a.itemCount;
      const da = new Date(a.eventDate || a.sortDate).getTime() || 0;
      const db = new Date(b.eventDate || b.sortDate).getTime() || 0;
      return sort === 'oldest' ? da - db : db - da;
    });
    return list;
  }, [collections, query, filter, sort]);

  const stats = useMemo(() => {
    const places = new Set(collections.map((c) => c.eventPlace).filter(Boolean));
    const photos = collections.reduce((sum, c) => sum + (c.itemCount || 0), 0);
    const attended = collections.filter((c) => c.userAttended).length;
    const contributors = new Set(collections.map((c) => c.creator.id)).size;
    return { places: places.size, photos, attended, contributors };
  }, [collections]);

  const now = Date.now();
  const upcoming = filtered
    .filter((c) => {
      const t = new Date(c.eventDate || c.sortDate).getTime();
      return !Number.isNaN(t) && t > now;
    })
    .sort((a, b) => new Date(a.eventDate || a.sortDate).getTime() - new Date(b.eventDate || b.sortDate).getTime());

  const past = filtered.filter((c) => !upcoming.some((u) => u.id === c.id));

  const renderCard = (c: CollectionCard, i: number) => (
    <article
      key={c.id}
      className="card card-hover group overflow-hidden fade-in"
      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
    >
      <button
        type="button"
        onClick={() => onOpenCollection(c.id)}
        className="shot relative block aspect-16/10 w-full"
      >
        {c.mosaicUrls?.length > 0 ? (
          <div
            className={`grid h-full w-full gap-[3px] ${
              c.mosaicUrls.length === 1 ? 'grid-cols-1' : c.mosaicUrls.length === 2 ? 'grid-cols-2' : c.mosaicUrls.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {c.mosaicUrls.slice(0, 4).map((url, idx) => (
              <div key={idx} className="relative h-full w-full overflow-hidden bg-[#0a0a12]">
                <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
                {idx === 3 && c.itemCount > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[13px] font-bold text-white">
                    +{c.itemCount - 3}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center gap-2 bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)]">
            <Layers className="h-5 w-5 opacity-60" /> No photos yet
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.72))' }} />

        <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
          {c.isEvent ? <Sparkles className="h-2.5 w-2.5 text-[var(--accent-amber)]" /> : <Layers className="h-2.5 w-2.5" />}
          {c.isEvent ? 'Event' : 'Collection'}
        </span>

        {c.userAttended && (
          <span className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200 backdrop-blur-md">
            <CheckCircle2 className="h-2.5 w-2.5" /> Attended
          </span>
        )}

        <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex translate-y-1 items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#16120a] opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          Open <ArrowUpRight className="h-3 w-3" />
        </span>
      </button>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display text-[14.5px] leading-snug transition group-hover:text-[var(--accent-amber)]">
            <button type="button" onClick={() => onOpenCollection(c.id)} className="text-left">
              {c.title}
            </button>
          </h3>
          <span className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1 font-mono text-[9.5px] text-[var(--text-muted)]">
            <Images className="h-3 w-3" /> {c.itemCount}
          </span>
        </div>

        {c.description && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{c.description}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {shortDate(c.eventDate || c.sortDate)}
          </span>
          {c.eventPlace && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {c.eventPlace}
            </span>
          )}
          {c.attendeesCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {c.attendeesCount}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={c.creator.displayName} color={c.creator.avatarColor} src={c.creator.avatarUrl} size={18} />
            <span className="truncate text-[10px] font-medium text-[var(--text-secondary)]">{c.creator.displayName}</span>
          </span>
          <button
            type="button"
            onClick={() => onOpenComments(c)}
            className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent-cyan)]"
          >
            <MessageSquare className="h-3 w-3" /> Discuss
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Chapters"
        title={
          <>
            Trips, dinners and
            <br className="hidden sm:block" /> the nights nobody planned
          </>
        }
        subtitle="Group moments become events with a date, a place, attendance and a shared note wall."
        accent="coral"
        actions={
          <>
            <button type="button" onClick={onPropose} className="btn btn-primary">
              <Plus className="h-3.5 w-3.5" /> New event
            </button>
            <button type="button" onClick={onOpenUpload} className="btn btn-soft">
              Add photos
            </button>
          </>
        }
        aside={
          <div className="hidden items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-3 py-2 sm:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
              <Clock className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-bold">{plural(upcoming.length, 'upcoming')}</p>
              <p className="text-[9.5px] text-[var(--text-muted)]">{plural(past.length, 'past chapter')}</p>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Chapters" value={collections.length} hint="events + collections" icon={<Layers className="h-4 w-4" />} />
        <StatTile label="Photos inside" value={stats.photos} hint="across all chapters" tone="coral" icon={<Images className="h-4 w-4" />} />
        <StatTile label="Places" value={stats.places} hint="distinct locations" tone="indigo" icon={<MapPin className="h-4 w-4" />} />
        <StatTile label="You attended" value={stats.attended} hint="checked in" tone="mint" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* toolbar */}
      <div className="surface flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Search chapters, places, people…" className="flex-1" />
        <div className="scroll-x flex items-center gap-1.5">
          {([
            { id: 'all', label: 'All' },
            { id: 'events', label: 'Events' },
            { id: 'collections', label: 'Collections' },
            { id: 'attended', label: 'I attended' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`chip ${filter === f.id ? 'chip-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="field !w-auto !py-1.5 appearance-none pr-7 text-[11px]"
            aria-label="Sort chapters"
          >
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="biggest">Most photos</option>
          </select>
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title={collections.length === 0 ? 'No chapters yet' : 'Nothing matches that'}
          body={
            collections.length === 0
              ? 'Create an event for a trip, a dinner, or turn an existing photo set into one.'
              : 'Try a different word, or switch back to all chapters.'
          }
          action={
            collections.length === 0 ? (
              <button type="button" onClick={onPropose} className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> Create the first one
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                className="btn btn-soft btn-sm"
              >
                Reset filters
              </button>
            )
          }
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-display text-[15px]">Coming up</h2>
                <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                <Badge tone="amber" dot>
                  {upcoming.length}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{upcoming.map(renderCard)}</div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-display text-[15px]">{upcoming.length > 0 ? 'Earlier chapters' : 'All chapters'}</h2>
              <span className="h-px flex-1 bg-[var(--border-subtle)]" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {past.length} shown
              </span>
            </div>
            {past.length === 0 ? (
              <EmptyState compact icon={<Images className="h-5 w-5" />} title="Nothing here yet" body="Past chapters appear once they have a date." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{past.map(renderCard)}</div>
            )}
          </section>
        </>
      )}

      {/* circle rail footnote */}
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <span className="eyebrow">visible circles</span>
        {groups.slice(0, 6).map((g) => (
          <span key={g.id} className="chip">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-amber)' }} />
            {g.name}
          </span>
        ))}
        {groups.length > 6 && <span className="chip">+{groups.length - 6} more</span>}
        <Dot />
        <span className="text-[10px] text-[var(--text-muted)]">Events respect circle visibility.</span>
      </div>
    </div>
  );
};
