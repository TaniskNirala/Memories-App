import React from 'react';
import { FeedItem, SinglePostFeedItem } from '../../types/index.ts';
import { MessageSquare, Images, Maximize2, Eye } from 'lucide-react';
import type { OnOpenViewer } from './types.ts';
import { PostCollage } from './PostCollage.tsx';

export const MonthMarker: React.FC<{ label: string; count: number; people?: number }> = ({ label, count }) => (
  <div className="tl-month">
    <span className="tl-month-pill">
      <span className="tl-month-dot" aria-hidden="true" />
      <span className="tl-month-label">{label}</span>
      <span className="tl-month-count" title={`${count} ${count === 1 ? 'memory' : 'memories'}`}>
        {count}
      </span>
    </span>
  </div>
);

/* ---------------------------------------------------------------------------
   Ring marker that sits on the spine at the start of a day (phones only;
   on desktop every card carries its own ring)
   --------------------------------------------------------------------------- */

export const DayNode: React.FC<{ date?: string }> = ({ date }) => (
  <div className="tl-day-node">
    <span className="sr-only">{date || 'memory'}</span>
  </div>
);

/* ---------------------------------------------------------------------------
   Post media area
   --------------------------------------------------------------------------- */

export const MediaFrame: React.FC<{
  item: SinglePostFeedItem;
  onOpenViewer: OnOpenViewer;
  onOpenComments: (item: FeedItem) => void;
  priority?: boolean;
}> = ({ item, onOpenViewer, onOpenComments, priority = false }) => (
  <div className="group/media relative">
    <PostCollage item={item} onOpenViewer={onOpenViewer} priority={priority} />

    {/* multi-photo badge (always visible on mobile, full prompt on hover) */}
    <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2 sm:inset-x-3 sm:top-3">
      <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-within/media:opacity-100 sm:flex">
        <Eye className="h-3 w-3" /> Tap to open
      </span>
      {item.files.length > 1 && (
        <span className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] font-semibold text-white">
          <Images className="h-3 w-3" /> {item.files.length}
        </span>
      )}
    </div>

    {/* quick actions */}
    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 opacity-100 transition-opacity duration-200 sm:bottom-3 sm:left-3 sm:opacity-0 sm:group-hover/media:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments(item);
        }}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-black/85"
      >
        <MessageSquare className="h-3 w-3" /> {item.commentsCount || 'Comment'}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded');
        }}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-black/85"
      >
        <Maximize2 className="h-3 w-3" /> View
      </button>
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Memory card (post)
   --------------------------------------------------------------------------- */