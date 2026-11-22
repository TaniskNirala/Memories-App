import React from 'react';
import { FeedItem } from '../../types/index.ts';
import { Sparkles, MessageSquare, Layers, Trash2, MoreHorizontal, Calendar, Images, MapPin, ShieldAlert, SlidersHorizontal, PencilLine, Users, ArrowUpRight } from 'lucide-react';
import { Dropdown, MenuItem, Dot } from '../ui/kit.tsx';
import { dayNumber, monthShort } from '../../lib/format.ts';

export const EventCard: React.FC<{
  item: Extract<FeedItem, { type: 'collection_card' }>;
  priority?: boolean;
  onOpenCollection: (id: string) => void;
  onOpenComments: (item: FeedItem) => void;
  onConvert: (item: FeedItem) => void;
  onPermissions: (item: FeedItem) => void;
  onDelete: (item: FeedItem) => void;
  onEditEvent: (item: FeedItem) => void;
  isDeleteProtected: boolean;
  canManage: boolean;
}> = React.memo(({
  item,
  priority = false,
  onOpenCollection,
  onOpenComments,
  onConvert,
  onPermissions,
  onDelete,
  onEditEvent,
  isDeleteProtected,
  canManage,
}) => {
  const mosaic = item.mosaicUrls || [];
  const layout =
    mosaic.length <= 1
      ? 'grid-cols-1'
      : mosaic.length === 2
        ? 'grid-cols-2'
        : mosaic.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2';

  return (
    <article className="tl-card card overflow-hidden">
      <div
        onClick={() => onOpenCollection(item.id)}
        className="shot relative aspect-16/9 w-full cursor-pointer border-b border-[var(--border-subtle)]"
      >
        <div className={`grid h-full w-full gap-1 ${layout}`}>
          {mosaic.length > 0 ? (
            mosaic.slice(0, 4).map((url, idx) => (
              <div key={idx} className="relative h-full w-full overflow-hidden bg-[#0a0a12]">
                <img
                  src={url}
                  alt={`${item.title} ${idx + 1}`}
                  loading={priority ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.tried && url.includes('key=')) {
                      target.dataset.tried = 'true';
                      try {
                        const key = new URL(url, window.location.origin).searchParams.get('key');
                        if (key) target.src = `/api/storage/view?key=${encodeURIComponent(key)}`;
                      } catch {
                        // malformed image URL: leave the image as it is
                      }
                    }
                  }}
                />
                {idx === 3 && item.itemCount > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/65 text-sm font-bold text-white">
                    +{item.itemCount - 3}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="flex h-full w-full items-center justify-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Layers className="h-5 w-5 opacity-60" /> Event preview
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white">
            <Sparkles className="h-3 w-3 text-[var(--accent-amber)]" />
            {item.isEvent ? 'Event' : 'Collection'}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white">
            <Images className="h-3 w-3" /> {item.itemCount}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            onClick={() => onOpenCollection(item.id)}
            className="group cursor-pointer font-display text-[15px] leading-snug transition hover:text-[var(--accent-amber)]"
          >
            {item.title}
          </h3>

          <Dropdown
            width={244}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-label="Event options"
                aria-expanded={open}
                className="btn-icon !h-8 !w-8 shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {({ close }) => (
              <div className="space-y-0.5">
                <MenuItem
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Open event"
                  onClick={() => {
                    close();
                    onOpenCollection(item.id);
                  }}
                />
                <MenuItem
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Event conversation"
                  onClick={() => {
                    close();
                    onOpenComments(item);
                  }}
                />
                {canManage && (
                  <>
                    <div className="my-1 h-px bg-[var(--border-subtle)]" />
                    <MenuItem
                      icon={<PencilLine className="h-3.5 w-3.5" />}
                      label="Edit event details"
                      onClick={() => {
                        close();
                        onEditEvent(item);
                      }}
                    />
                    {!item.isEvent && (
                      <MenuItem
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        label="Convert to event"
                        tone="accent"
                        onClick={() => {
                          close();
                          onConvert(item);
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                      label="Circles & permissions"
                      onClick={() => {
                        close();
                        onPermissions(item);
                      }}
                    />
                    <div className="my-1 h-px bg-[var(--border-subtle)]" />
                    {isDeleteProtected ? (
                      <div className="tone-amber flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[10px] font-semibold">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Delete is locked in preview
                      </div>
                    ) : (
                      <MenuItem
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        label="Delete event"
                        tone="danger"
                        onClick={() => {
                          close();
                          onDelete(item);
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </Dropdown>
        </div>

        {item.description && (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
            {item.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[var(--text-muted)]">
          {item.eventDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {monthShort(item.eventDate)} {dayNumber(item.eventDate)}
            </span>
          )}
          {item.eventPlace && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {item.eventPlace}
            </span>
          )}
          {item.attendeesCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {item.attendeesCount} attended
            </span>
          )}
          <span className="flex items-center gap-1">
            <Dot /> by {item.creator.displayName}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button type="button" onClick={() => onOpenComments(item)} className="chip">
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-cyan)]" /> Conversation
          </button>
          <button
            type="button"
            onClick={() => onOpenCollection(item.id)}
            className="group flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] transition hover:text-[var(--accent-amber)]"
          >
            View event
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </article>
  );
});

/* ---------------------------------------------------------------------------
   Main timeline
   --------------------------------------------------------------------------- */
