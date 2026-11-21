import React, { useState, useMemo, useEffect } from 'react';
import { FeedItem, SinglePostFeedItem, Group } from '../types/index.ts';
import {
  Lock,
  Check,
  Sparkles,
  MessageSquare,
  Layers,
  Trash2,
  MoreHorizontal,
  Calendar,
  X,
  Flag,
  Share2,
  Images,
  MapPin,
  ShieldAlert,
  SlidersHorizontal,
  CheckCircle2,
  RefreshCw,
  Play,
  Maximize2,
  PencilLine,
  Users,
  ArrowUpRight,
  Eye,
  Plus,
  Grid,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { ViewingPermissionsModal } from './ViewingPermissionsModal.tsx';
import { isVideoMedia, getVideoPosterUrl } from '../utils/videoThumbnail.ts';
import { TgDeletedBadge } from './TgDeletedBadge.tsx';
import { Avatar, Badge, Modal, ModalHeader, Dropdown, MenuItem, EmptyState, Dot } from './ui/kit.tsx';
import { dayNumber, monthShort, monthYearLabel, relativeTime, accentFromName, plural } from '../lib/format.ts';

interface TimelineFeedProps {
  items: FeedItem[];
  groups: Group[];
  selectedGroupId?: string;
  onOpenViewer: (item: FeedItem, initialIndex?: number, initialMode?: 'grid' | 'expanded') => void;
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (collectionId: string) => void;
  onShareToGroup: (itemId: string, itemType: 'post' | 'album', groupId: string) => Promise<void>;
  onOpenUpload: () => void;
  onDeletePost?: (postId: string, permanent?: boolean) => Promise<void>;
  onDeleteAlbum?: (albumId: string, permanent?: boolean) => Promise<void>;
  onMemoryUpdated?: () => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

interface PostCollageProps {
  item: SinglePostFeedItem;
  onOpenViewer: (item: FeedItem, initialIndex?: number, initialMode?: 'grid' | 'expanded') => void;
}

const PostCollage: React.FC<PostCollageProps> = ({ item, onOpenViewer }) => {
  const files = item.files || [];
  const count = files.length;

  if (count === 0) {
    return (
      <div className="w-full aspect-16/9 sm:aspect-2/1 rounded-xl bg-neutral-900 border border-[var(--border-color)] flex items-center justify-center mb-3">
        <Sparkles className="w-8 h-8 text-amber-300 opacity-60" />
      </div>
    );
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, storageKey?: string) => {
    const target = e.currentTarget;
    const stage = target.dataset.fallbackStage || '0';
    if (stage === '0' && storageKey) {
      target.dataset.fallbackStage = '1';
      // If thumb failed, try full res; if full res failed, try thumb
      const altKey = storageKey.includes('_thumb')
        ? storageKey.replace('_thumb', '')
        : storageKey.replace(/(\.[a-zA-Z0-9]+)$/, '_thumb$1');
      target.src = `/api/storage/view?key=${encodeURIComponent(altKey)}`;
    } else if (stage === '1' && storageKey) {
      target.dataset.fallbackStage = '2';
      target.src = `/api/storage/view?key=${encodeURIComponent(storageKey)}`;
    } else if (stage === '2' && storageKey) {
      target.dataset.fallbackStage = '3';
      const clean = storageKey.replace(/^[/\\]+/, '').replace(/^uploads[/\\]+/, '');
      target.src = `/uploads/${clean}`;
    } else if (stage !== '4') {
      target.dataset.fallbackStage = '4';
      target.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="100%" height="100%" fill="%23181829"/><circle cx="400" cy="270" r="45" fill="%23f59e0b" opacity="0.2"/><path d="M370 295 L400 245 L430 295 Z" fill="%23f59e0b" opacity="0.8"/><circle cx="430" cy="245" r="9" fill="%23f43f5e" opacity="0.8"/></svg>';
    }
  };

  const renderMediaTile = (
    f: SinglePostFeedItem['files'][number],
    alt: string,
    imgClassName: string
  ) => {
    if (isVideoMedia(f)) {
      const posterUrl = getVideoPosterUrl(f);
      return (
        <>
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={alt}
              referrerPolicy="no-referrer"
              onError={(e) => handleImageError(e, f.thumbKey || f.storageKey)}
              className={imgClassName}
            />
          ) : (
            <video
              src={f.viewUrl ? `${f.viewUrl}#t=0.1` : undefined}
              muted
              playsInline
              preload="metadata"
              className={imgClassName}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-xs border border-white/25 flex items-center justify-center text-white shadow-lg">
              <Play className="w-4 h-4 fill-current text-amber-400 ml-0.5" />
            </div>
          </div>
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold uppercase tracking-wider pointer-events-none">
            Video
          </span>
          {f.tgDeleted && <TgDeletedBadge compact />}
        </>
      );
    }

    return (
      <>
        <img
          src={f.viewUrl || f.thumbUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={(e) => handleImageError(e, f.storageKey)}
          className={imgClassName}
        />
        {f.tgDeleted && <TgDeletedBadge compact />}
      </>
    );
  };

  // 1 photo or video: Full width
  if (count === 1) {
    const f = files[0];
    if (isVideoMedia(f)) {
      const posterUrl = getVideoPosterUrl(f);
      return (
        <div className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden bg-black border border-[var(--border-color)] mb-3 group/media">
          <video
            src={f.viewUrl}
            poster={posterUrl}
            controls
            playsInline
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full object-contain bg-black"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(item, 0, 'expanded');
            }}
            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1 shadow-lg transition cursor-pointer"
            title="Open video in full viewer"
          >
            <Maximize2 className="w-3 h-3 text-amber-400" />
            <span>Expand</span>
          </button>
          {f.tgDeleted && <TgDeletedBadge position="top-left" />}
        </div>
      );
    }

    return (
      <div
        onClick={() => onOpenViewer(item, 0, 'expanded')}
        className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden cursor-pointer bg-neutral-900 border border-[var(--border-color)] mb-3 group/media"
      >
        <img
          src={f.viewUrl || f.thumbUrl}
          alt={item.caption || 'Memory photo'}
          referrerPolicy="no-referrer"
          onError={(e) => handleImageError(e, f.storageKey)}
          className="w-full h-full object-cover group-hover/media:scale-[1.02] transition-transform duration-300"
        />
        {f.tgDeleted && <TgDeletedBadge />}
      </div>
    );
  }

  // 2 items: Split columns side-by-side
  if (count === 2) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-2 gap-1.5 w-full h-full">
          {files.map((f, idx) => (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenViewer(item, idx, 'expanded');
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
              )}
            </div>
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>2 Items</span>
        </button>
      </div>
    );
  }

  // 3 items: 1 large feature item on left, 2 stacked on right
  if (count === 3) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-3 gap-1.5 w-full h-full">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(item, 0, 'expanded');
            }}
            className="col-span-2 relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
          >
            {renderMediaTile(
              files[0],
              `${item.caption || 'Memory'} 1`,
              'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
            )}
          </div>

          <div className="col-span-1 grid grid-rows-2 gap-1.5 h-full">
            {files.slice(1, 3).map((f, i) => {
              const realIdx = i + 1;
              return (
                <div
                  key={f.id || realIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenViewer(item, realIdx, 'expanded');
                  }}
                  className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
                >
                  {renderMediaTile(
                    f,
                    `${item.caption || 'Memory'} ${realIdx + 1}`,
                    'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>3 Items</span>
        </button>
      </div>
    );
  }

  // 4 items: 2x2 grid
  if (count === 4) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-2 gap-1.5 w-full h-full">
          {files.map((f, idx) => (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenViewer(item, idx, 'expanded');
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
              )}
            </div>
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>4 Items</span>
        </button>
      </div>
    );
  }

  // 5+ items: 2x2 grid with +N overlay on the 4th item
  const extraCount = count - 4;
  return (
    <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
      <div className="grid grid-cols-2 gap-1.5 w-full h-full">
        {files.slice(0, 4).map((f, idx) => {
          const isFourth = idx === 3;
          return (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                if (isFourth) {
                  onOpenViewer(item, 0, 'grid');
                } else {
                  onOpenViewer(item, idx, 'expanded');
                }
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900 group/cell"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                `w-full h-full object-cover transition-transform duration-300 ${
                  isFourth ? 'brightness-75' : 'hover:scale-105'
                }`
              )}

              {isFourth && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-xs flex flex-col items-center justify-center text-white hover:bg-black/55 transition">
                  <span className="font-display font-bold text-xl sm:text-2xl text-amber-300">
                    +{extraCount + 1}
                  </span>
                  <span className="text-[10px] sm:text-xs text-neutral-200 flex items-center gap-1 font-medium mt-0.5">
                    <Grid className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Photos</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenViewer(item, 0, 'grid');
        }}
        className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
      >
        <Images className="w-3.5 h-3.5 text-amber-400" />
        <span>{count} Photos</span>
      </button>
    </div>
  );
};
/* ---------------------------------------------------------------------------
   Month rail marker — the anchor for each timeline block
   --------------------------------------------------------------------------- */

const MonthMarker: React.FC<{ label: string; count: number; people: number }> = ({ label, count, people }) => (
  <div className="tl-month">
    <span className="tl-month-pill">
      <Calendar className="!h-6 !w-6" />
      <span className="font-display text-[13px] leading-none">{label}</span>
      <span className="ml-1 flex items-center gap-1.5 border-l border-[var(--border-subtle)] pl-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {count} {count === 1 ? 'memory' : 'memories'}
        <Dot />
        {people} {people === 1 ? 'person' : 'people'}
      </span>
    </span>
  </div>
);

/* ---------------------------------------------------------------------------
   Day marker that sits on the spine — carries the day number itself
   --------------------------------------------------------------------------- */

const DayNode: React.FC<{ date?: string; color: string }> = ({ date, color }) => (
  <div
    className="tl-day-node"
    style={{ color, borderColor: `color-mix(in oklab, ${color} 55%, var(--border-color))` }}
  >
    <span>{dayNumber(date)}</span>
    <span className="sr-only">{date || 'memory'}</span>
  </div>
);

/* ---------------------------------------------------------------------------
   Post media area
   --------------------------------------------------------------------------- */

const MediaFrame: React.FC<{
  item: SinglePostFeedItem;
  onOpenViewer: TimelineFeedProps['onOpenViewer'];
  onOpenComments: (item: FeedItem) => void;
}> = ({ item, onOpenViewer, onOpenComments }) => (
  <div className="group/media relative">
    <PostCollage item={item} onOpenViewer={onOpenViewer} />

    {/* hover affordance */}
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-within/media:opacity-100">
      <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
        <Eye className="h-3 w-3" /> Tap to open
      </span>
      {item.files.length > 1 && (
        <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
          <Images className="h-3 w-3" /> {item.files.length}
        </span>
      )}
    </div>

    {/* quick actions */}
    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-0 transition-all duration-200 group-hover/media:translate-y-0 group-hover/media:opacity-100">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments(item);
        }}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md transition hover:bg-black/70"
      >
        <MessageSquare className="h-3 w-3" /> {item.commentsCount || 'Comment'}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded');
        }}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md transition hover:bg-black/70"
      >
        <Maximize2 className="h-3 w-3" /> View
      </button>
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Memory card (post)
   --------------------------------------------------------------------------- */

const MemoryCard: React.FC<{
  item: SinglePostFeedItem;
  groups: Group[];
  selectedGroupId?: string;
  open: boolean;
  onToggleOptions: () => void;
  onOpenViewer: TimelineFeedProps['onOpenViewer'];
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (id: string) => void;
  onShare: (item: FeedItem, groupId: string) => void;
  sharing: boolean;
  onEdit: () => void;
  onConvert: () => void;
  onPermissions: () => void;
  onDelete: () => void;
  onReport: () => void;
  onRemoveFromCircle: (groupId: string) => void;
  isDeleteProtected: boolean;
  closeOptions: () => void;
}> = ({
  item,
  groups,
  selectedGroupId,
  open,
  onToggleOptions,
  onOpenViewer,
  onOpenComments,
  onShare,
  sharing,
  onEdit,
  onConvert,
  onPermissions,
  onDelete,
  onReport,
  onRemoveFromCircle,
  isDeleteProtected,
  closeOptions,
}) => {
  const { user } = useAuth();
  const isOwner = user?.id === item.owner.id || item.isOwner;
  const isAdmin = user?.role === 'admin';
  const canManage = isOwner || isAdmin;
  const accent = accentFromName(item.owner.displayName);
  const placementNames = item.placements?.length
    ? item.placements.map((p) => p.groupName).join(', ')
    : 'Only me';

  return (
    <article className="tl-card card overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={item.owner.displayName} color={item.owner.avatarColor} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-bold leading-tight">{item.owner.displayName}</span>
              {item.isOwner && <Badge tone="amber">You</Badge>}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-[var(--text-muted)]">
              <span className="font-mono">@{item.owner.username}</span>
              <Dot />
              <span>{relativeTime(item.takenAt)}</span>
              <Dot />
              <span className="truncate font-medium" style={{ color: 'var(--accent-cyan)' }}>
                {placementNames}
              </span>
            </div>
          </div>
        </div>

        <Dropdown
          width={252}
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={() => {
                onToggleOptions();
                toggle();
              }}
              aria-label="Memory options"
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
                icon={<Maximize2 className="h-3.5 w-3.5" />}
                label="Open full view"
                onClick={() => {
                  close();
                  closeOptions();
                  onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded');
                }}
              />
              <MenuItem
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Read comments"
                hint={String(item.commentsCount || '')}
                onClick={() => {
                  close();
                  closeOptions();
                  onOpenComments(item);
                }}
              />
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  <MenuItem
                    icon={<PencilLine className="h-3.5 w-3.5" />}
                    label="Edit date & caption"
                    onClick={() => {
                      close();
                      closeOptions();
                      onEdit();
                    }}
                  />
                  <MenuItem
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    label="Convert to event"
                    tone="accent"
                    onClick={() => {
                      close();
                      closeOptions();
                      onConvert();
                    }}
                  />
                  <MenuItem
                    icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                    label="Circles & permissions"
                    onClick={() => {
                      close();
                      closeOptions();
                      onPermissions();
                    }}
                  />
                </>
              )}
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  <p className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Remove from circle
                  </p>
                  {item.placements?.length ? (
                    item.placements.map((pl) => (
                      <MenuItem
                        key={pl.id || pl.groupId}
                        icon={<X className="h-3.5 w-3.5" />}
                        label={pl.groupName}
                        onClick={() => {
                          close();
                          closeOptions();
                          onRemoveFromCircle(pl.groupId);
                        }}
                      />
                    ))
                  ) : selectedGroupId ? (
                    <MenuItem
                      icon={<X className="h-3.5 w-3.5" />}
                      label="This circle"
                      onClick={() => {
                        close();
                        closeOptions();
                        onRemoveFromCircle(selectedGroupId);
                      }}
                    />
                  ) : (
                    <p className="px-2.5 py-1 text-[10.5px] text-[var(--text-muted)]">Not shared with a circle</p>
                  )}
                </>
              )}
              {!isOwner && (
                <MenuItem
                  icon={<Flag className="h-3.5 w-3.5" />}
                  label="Report this memory"
                  onClick={() => {
                    close();
                    closeOptions();
                    onReport();
                  }}
                />
              )}
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  {isDeleteProtected ? (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-400">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Delete is locked in preview
                    </div>
                  ) : (
                    <MenuItem
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="Delete memory"
                      tone="danger"
                      onClick={() => {
                        close();
                        closeOptions();
                        onDelete();
                      }}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </Dropdown>
      </div>

      {/* body */}
      <div className="px-4 pb-1 pt-3">
        {item.caption && (
          <p className="mb-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">{item.caption}</p>
        )}
        <MediaFrame item={item} onOpenViewer={onOpenViewer} onOpenComments={onOpenComments} />
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenComments(item)}
            className="chip hover:text-[var(--text-primary)]"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
            {item.commentsCount > 0 ? `${item.commentsCount} ${item.commentsCount === 1 ? 'comment' : 'comments'}` : 'Add a comment'}
          </button>

          <Dropdown
            width={236}
            align="left"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="chip" disabled={sharing}>
                {sharing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 text-[var(--accent-amber)]" />}
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            )}
          >
            {({ close }) => (
              <div className="space-y-0.5">
                <p className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Share into circle
                </p>
                {groups.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">No circles yet</p>
                )}
                {groups.map((g) => {
                  const already = item.placements?.some((p) => p.groupId === g.id);
                  return (
                    <MenuItem
                      key={g.id}
                      icon={<Users className="h-3.5 w-3.5" />}
                      label={g.name}
                      hint={already ? '✓' : undefined}
                      onClick={() => {
                        close();
                        onShare(item, g.id);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </Dropdown>
        </div>

        <button
          type="button"
          onClick={() => onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded')}
          className="group flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] transition hover:text-[var(--accent-amber)]"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      </div>
    </article>
  );
};

/* ---------------------------------------------------------------------------
   Event card (album)
   --------------------------------------------------------------------------- */

const EventCard: React.FC<{
  item: Extract<FeedItem, { type: 'collection_card' }>;
  onOpenCollection: (id: string) => void;
  onOpenComments: (item: FeedItem) => void;
  onConvert: () => void;
  onPermissions: () => void;
  onDelete: () => void;
  onEditEvent: () => void;
  open: boolean;
  onToggleOptions: () => void;
  closeOptions: () => void;
  isDeleteProtected: boolean;
  canManage: boolean;
}> = ({
  item,
  onOpenCollection,
  onOpenComments,
  onConvert,
  onPermissions,
  onDelete,
  onEditEvent,
  open,
  onToggleOptions,
  closeOptions,
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
        className={`shot relative aspect-16/9 w-full cursor-pointer border-b border-[var(--border-subtle)] ${''}`}
      >
        <div className={`grid h-full w-full gap-1 ${layout}`}>
          {mosaic.length > 0 ? (
            mosaic.slice(0, 4).map((url, idx) => (
              <div key={idx} className="relative h-full w-full overflow-hidden bg-[#0a0a12]">
                <img
                  src={url}
                  alt={`${item.title} ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.tried && url.includes('key=')) {
                      target.dataset.tried = 'true';
                      try {
                        const key = new URL(url, window.location.origin).searchParams.get('key');
                        if (key) target.src = `/api/storage/view?key=${encodeURIComponent(key)}`;
                      } catch {}
                    }
                  }}
                />
                {idx === 3 && item.itemCount > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold text-white backdrop-blur-[1px]">
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
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-[var(--accent-amber)]" />
            {item.isEvent ? 'Event' : 'Collection'}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
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
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={() => {
                  onToggleOptions();
                  toggle();
                }}
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
                    closeOptions();
                    onOpenCollection(item.id);
                  }}
                />
                <MenuItem
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Event conversation"
                  onClick={() => {
                    close();
                    closeOptions();
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
                        closeOptions();
                        onEditEvent();
                      }}
                    />
                    {!item.isEvent && (
                      <MenuItem
                        icon={<Sparkles className="h-3.5 w-3.5" />}
                        label="Convert to event"
                        tone="accent"
                        onClick={() => {
                          close();
                          closeOptions();
                          onConvert();
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                      label="Circles & permissions"
                      onClick={() => {
                        close();
                        closeOptions();
                        onPermissions();
                      }}
                    />
                    <div className="my-1 h-px bg-[var(--border-subtle)]" />
                    {isDeleteProtected ? (
                      <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-400">
                        <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Delete is locked in preview
                      </div>
                    ) : (
                      <MenuItem
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        label="Delete event"
                        tone="danger"
                        onClick={() => {
                          close();
                          closeOptions();
                          onDelete();
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
};

/* ---------------------------------------------------------------------------
   Main timeline
   --------------------------------------------------------------------------- */

export const TimelineFeed: React.FC<TimelineFeedProps> = ({
  items,
  groups,
  selectedGroupId,
  onOpenViewer,
  onOpenComments,
  onOpenCollection,
  onShareToGroup,
  onOpenUpload,
  onDeletePost,
  onDeleteAlbum,
  onMemoryUpdated,
  isFiltered,
  onResetFilters,
}) => {
  const { user } = useAuth();
  const [openOptionsMenuId, setOpenOptionsMenuId] = useState<string | null>(null);
  const [sharingLoadingId, setSharingLoadingId] = useState<string | null>(null);

  const [deleteConfirmItem, setDeleteConfirmItem] = useState<FeedItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [editItem, setEditItem] = useState<{ id: string; caption: string; takenAt: string } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [reportItem, setReportItem] = useState<FeedItem | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const [convertToEventItem, setConvertToEventItem] = useState<FeedItem | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventPlace, setEventPlace] = useState('');
  const [convertingLoading, setConvertingLoading] = useState(false);
  const [permissionsItem, setPermissionsItem] = useState<FeedItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isDeleteProtected, setIsDeleteProtected] = useState(true);

  useEffect(() => {
    apiFetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.isDeleteProtected === 'boolean') setIsDeleteProtected(cfg.isDeleteProtected);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const dateOf = (item: FeedItem) =>
    item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;

  /* month sections → day clusters inside each month, newest first */
  const sections = useMemo(() => {
    type DayCluster = { key: string; date?: string; items: FeedItem[] };
    const months = new Map<
      string,
      { key: string; label: string; sort: number; items: FeedItem[]; days: Map<string, DayCluster> }
    >();

    for (const item of items) {
      const raw = item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;
      const d = raw ? new Date(raw) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const key = valid ? `${d!.getFullYear()}-${String(d!.getMonth()).padStart(2, '0')}` : 'undated';
      const label = valid ? monthYearLabel(d) : 'Undated memories';
      const sort = valid ? d!.getFullYear() * 12 + d!.getMonth() : -1;
      if (!months.has(key)) months.set(key, { key, label, sort, items: [], days: new Map() });
      const month = months.get(key)!;
      month.items.push(item);

      const dayKey = valid ? d!.toISOString().slice(0, 10) : 'undated';
      if (!month.days.has(dayKey)) month.days.set(dayKey, { key: dayKey, date: valid ? raw : undefined, items: [] });
      month.days.get(dayKey)!.items.push(item);
    }

    return Array.from(months.values())
      .sort((a, b) => b.sort - a.sort)
      .map((m) => ({
        key: m.key,
        label: m.label,
        items: m.items,
        days: Array.from(m.days.values()).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)),
      }));
  }, [items]);

  const quote = useMemo(() => {
    const total = items.length;
    const authors = new Set(
      items.map((i) => (i.type === 'single_post' ? i.owner.id : i.creator.id))
    );
    return { total, authors: authors.size };
  }, [items]);

  const handleShareClick = async (item: FeedItem, targetGroupId: string) => {
    setSharingLoadingId(item.id);
    try {
      await onShareToGroup(item.id, item.type === 'single_post' ? 'post' : 'album', targetGroupId);
      setToastMessage('Shared with the circle');
    } catch {
      setToastMessage('Could not share to that circle');
    } finally {
      setSharingLoadingId(null);
    }
  };

  const executeDelete = async (permanent: boolean) => {
    if (!deleteConfirmItem) return;
    setDeleteLoading(true);
    try {
      if (deleteConfirmItem.type === 'single_post') {
        await onDeletePost?.(deleteConfirmItem.id, permanent);
      } else {
        await onDeleteAlbum?.(deleteConfirmItem.id, permanent);
      }
      setDeleteConfirmItem(null);
      setToastMessage(permanent ? 'Deleted permanently' : 'Moved to trash');
    } finally {
      setDeleteLoading(false);
    }
  };

  const executeEdit = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/api/posts/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: editItem.caption, takenAt: new Date(editItem.takenAt).toISOString() }),
      });
      if (res.ok) {
        setEditItem(null);
        onMemoryUpdated?.();
        setToastMessage('Memory updated');
      }
    } finally {
      setEditLoading(false);
    }
  };

  const executeReport = async () => {
    if (!reportItem || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: reportItem.type === 'single_post' ? 'post' : 'album',
          targetId: reportItem.id,
          reason: reportReason.trim(),
        }),
      });
      if (res.ok) {
        setReportSuccess(true);
        setTimeout(() => {
          setReportItem(null);
          setReportSuccess(false);
          setReportReason('');
        }, 1400);
      }
    } finally {
      setReportLoading(false);
    }
  };

  const handleRemoveFromCircle = async (item: FeedItem, groupId: string) => {
    const placement = item.placements?.find((p) => p.groupId === groupId);
    const circleName = placement?.groupName || groups.find((g) => g.id === groupId)?.name || 'circle';
    if (item.placements) item.placements = item.placements.filter((p) => p.groupId !== groupId);

    try {
      let res: Response | undefined;
      if (placement && (placement as any).id) {
        res = await apiFetch(`/api/placements/${(placement as any).id}`, { method: 'DELETE' });
      } else {
        res = await apiFetch('/api/placements/remove-by-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.id,
            itemType: item.type === 'single_post' ? 'post' : 'album',
            groupId,
          }),
        });
      }
      if (res?.ok) {
        setToastMessage(`Removed from “${circleName}”`);
        onMemoryUpdated?.();
      } else {
        const err = await res?.json().catch(() => ({}));
        setToastMessage(err?.error || `Could not remove from “${circleName}”`);
      }
    } catch {
      setToastMessage('Something went wrong removing that circle');
    }
  };

  const openConvert = (item: FeedItem) => {
    const raw = item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;
    setEventTitle(item.type === 'single_post' ? item.caption || 'Event memory' : item.title);
    setEventDate(raw ? new Date(raw).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEventPlace(item.type === 'collection_card' ? item.eventPlace || '' : '');
    setConvertToEventItem(item);
  };

  const executeConvertToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertToEventItem) return;
    setConvertingLoading(true);
    try {
      const res =
        convertToEventItem.type === 'collection_card'
          ? await apiFetch(`/api/albums/${convertToEventItem.id}/convert-to-event`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: eventTitle.trim() || convertToEventItem.title, eventDate, eventPlace }),
            })
          : await apiFetch(`/api/posts/${convertToEventItem.id}/convert-to-event`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: eventTitle, eventDate, eventPlace }),
            });
      if (res.ok) {
        setConvertToEventItem(null);
        onMemoryUpdated?.();
        setToastMessage('Memory turned into an event');
      }
    } catch {
      setToastMessage('Could not convert this memory');
    } finally {
      setConvertingLoading(false);
    }
  };


  /** "Wed" for the day chip in the rail header */
  const weekdayLabel = (value?: string) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'Undated';
    return d.toLocaleDateString([], { weekday: 'short' });
  };

  /** the person who owns most of a day's memories — tints the spine node */
  const dayOwnerName = (dayItems: FeedItem[]) => {
    const counts = new Map<string, number>();
    for (const i of dayItems) {
      const name = i.type === 'single_post' ? i.owner.displayName : i.creator.displayName;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    let best = '';
    let bestN = 0;
    counts.forEach((n, name) => {
      if (n > bestN) {
        best = name;
        bestN = n;
      }
    });
    return best;
  };

  return (
    <div className="relative">
      {/* toast */}
      {toastMessage && (
        <div className="fixed left-1/2 top-[74px] z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)]/95 px-4 py-2 text-[11.5px] font-semibold shadow-[var(--shadow-float)] backdrop-blur-xl fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={<X className="h-6 w-6" />}
            title="Nothing matches those filters"
            body="Try a different person, tag or date window — or clear everything and go back to the full timeline."
            action={
              onResetFilters && (
                <button type="button" onClick={onResetFilters} className="btn btn-primary btn-sm">
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="The timeline starts with you"
            body="Drop in the first photo or clip. Once it lands, it takes its place on the rail with the date it was taken."
            action={
              <button type="button" onClick={onOpenUpload} className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add a memory
              </button>
            }
          />
        )
      ) : (
        <>
          {/* Timeline summary band */}
          <div className="tl-summary">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="tl-summary-icon">
                <Layers className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="tl-summary-title truncate">
                  {quote.total === 1 ? '1 memory' : `${quote.total} memories`} on the rail
                </p>
                <p className="tl-summary-sub truncate">
                  {plural(quote.authors, 'contributor')} · {plural(sections.length, 'chapter')} ·{' '}
                  {plural(sections.reduce((n, sec) => n + sec.days.length, 0), 'day')}
                </p>
              </div>
            </div>
            <span className="tl-summary-order">newest → oldest</span>
          </div>

          <div className="tl-root">
            <div className="tl-rail" aria-hidden="true" />

            {sections.map((section) => {
              const people = new Set(
                section.items.map((i) => (i.type === 'single_post' ? i.owner.id : i.creator.id))
              ).size;

              return (
                <section key={section.key} className="tl-section">
                  <MonthMarker label={section.label} count={section.items.length} people={people} />

                  {section.days.map((day) => {
                    const dayCount = day.items.length;
                    return (
                      <div key={day.key} className="tl-day">
                        <div className="tl-day-head">
                          <span className="tl-day-weekday">{weekdayLabel(day.date)}</span>
                          <span className="tl-day-count">
                            {dayCount === 1 ? '1 memory' : `${dayCount} memories`}
                          </span>
                          <span className="tl-day-rule" aria-hidden />
                        </div>

                        <div className="tl-day-cards">
                          {day.items.map((item) => {
                            const accent =
                              item.type === 'single_post'
                                ? accentFromName(item.owner.displayName)
                                : 'var(--accent-coral)';
                            const ownerId = item.type === 'single_post' ? item.owner.id : item.creator.id;
                            const canManage = user?.id === ownerId || user?.role === 'admin';

                            return (
                              <div key={item.id} className="tl-entry">
                                {item.type === 'single_post' ? (
                                  item.isLockedPlaceholder ? (
                                    <div className="card relative overflow-hidden p-5 text-center">
                                      <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/35 bg-amber-500/12 text-[var(--accent-amber)]">
                                        <Lock className="h-5 w-5" />
                                      </div>
                                      <p className="font-display text-sm">Locked memory</p>
                                      <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--text-muted)]">
                                        {item.lockedReason ||
                                          `${item.owner.displayName} hasn’t approved sharing this into this circle yet.`}
                                      </p>
                                    </div>
                                  ) : (
                                    <MemoryCard
                                      item={item}
                                      groups={groups}
                                      selectedGroupId={selectedGroupId}
                                      open={openOptionsMenuId === item.id}
                                      onToggleOptions={() =>
                                        setOpenOptionsMenuId(openOptionsMenuId === item.id ? null : item.id)
                                      }
                                      closeOptions={() => setOpenOptionsMenuId(null)}
                                      onOpenViewer={onOpenViewer}
                                      onOpenComments={onOpenComments}
                                      onOpenCollection={onOpenCollection}
                                      onShare={handleShareClick}
                                      sharing={sharingLoadingId === item.id}
                                      onEdit={() =>
                                        setEditItem({
                                          id: item.id,
                                          caption: item.caption || '',
                                          takenAt: item.takenAt
                                            ? new Date(item.takenAt).toISOString().slice(0, 10)
                                            : new Date().toISOString().slice(0, 10),
                                        })
                                      }
                                      onConvert={() => openConvert(item)}
                                      onPermissions={() => setPermissionsItem(item)}
                                      onDelete={() => setDeleteConfirmItem(item)}
                                      onReport={() => setReportItem(item)}
                                      onRemoveFromCircle={(gid) => handleRemoveFromCircle(item, gid)}
                                      isDeleteProtected={isDeleteProtected}
                                    />
                                  )
                                ) : (
                                  <EventCard
                                    item={item}
                                    onOpenCollection={onOpenCollection}
                                    onOpenComments={onOpenComments}
                                    onConvert={() => openConvert(item)}
                                    onPermissions={() => setPermissionsItem(item)}
                                    onDelete={() => setDeleteConfirmItem(item)}
                                    onEditEvent={() => openConvert(item)}
                                    open={openOptionsMenuId === item.id}
                                    onToggleOptions={() =>
                                      setOpenOptionsMenuId(openOptionsMenuId === item.id ? null : item.id)
                                    }
                                    closeOptions={() => setOpenOptionsMenuId(null)}
                                    isDeleteProtected={isDeleteProtected}
                                    canManage={canManage}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <DayNode date={day.date} color={accentFromName(dayOwnerName(day.items))} />
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ delete */}
      <Modal
        open={Boolean(deleteConfirmItem)}
        onClose={() => !deleteLoading && setDeleteConfirmItem(null)}
        size="sm"
        label="Delete memory"
      >
        <ModalHeader
          icon={<Trash2 className="h-4 w-4" />}
          eyebrow="Remove"
          title={deleteConfirmItem?.type === 'collection_card' ? 'Delete this event?' : 'Delete this memory?'}
          onClose={() => !deleteLoading && setDeleteConfirmItem(null)}
        />
        <div className="space-y-2.5 p-5">
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            “{deleteConfirmItem?.type === 'collection_card' ? deleteConfirmItem.title : deleteConfirmItem?.caption || 'This memory'}”
          </p>

          <button
            type="button"
            onClick={() => executeDelete(false)}
            disabled={deleteLoading}
            className="flex w-full items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-3 text-left transition hover:border-[var(--accent-amber)]/50"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
            <span>
              <span className="block text-[12px] font-bold">Move to trash</span>
              <span className="block text-[10.5px] text-[var(--text-muted)]">Recoverable for 30 days</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => executeDelete(true)}
            disabled={deleteLoading || isDeleteProtected}
            className="flex w-full items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/8 px-3.5 py-3 text-left transition hover:border-rose-500/45 disabled:opacity-50"
          >
            <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>
              <span className="block text-[12px] font-bold text-rose-300">Delete forever</span>
              <span className="block text-[10.5px] text-rose-300/70">
                {isDeleteProtected ? 'Locked in preview' : 'Removes the files immediately'}
              </span>
            </span>
          </button>

          <div className="flex justify-end pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmItem(null)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------- edit */}
      <Modal open={Boolean(editItem)} onClose={() => !editLoading && setEditItem(null)} size="sm" label="Edit memory">
        <ModalHeader
          icon={<PencilLine className="h-4 w-4" />}
          eyebrow="Edit"
          title="Date & caption"
          onClose={() => !editLoading && setEditItem(null)}
        />
        <div className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="memory-date">
              Date taken
            </label>
            <input
              id="memory-date"
              type="date"
              value={editItem?.takenAt || ''}
              onChange={(e) => editItem && setEditItem({ ...editItem, takenAt: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="memory-caption">
              Caption
            </label>
            <textarea
              id="memory-caption"
              rows={3}
              value={editItem?.caption || ''}
              onChange={(e) => editItem && setEditItem({ ...editItem, caption: e.target.value })}
              className="field resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditItem(null)} disabled={editLoading}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={executeEdit} disabled={editLoading}>
              {editLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {editLoading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------ report */}
      <Modal open={Boolean(reportItem)} onClose={() => setReportItem(null)} size="sm" label="Report memory">
        <ModalHeader
          icon={<Flag className="h-4 w-4" />}
          eyebrow="Trust & safety"
          title="Report to admins"
          onClose={() => setReportItem(null)}
        />
        <div className="p-5">
          {reportSuccess ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-[12px] font-semibold text-emerald-300">Report submitted. Thank you.</p>
            </div>
          ) : (
            <>
              <label className="label" htmlFor="report-reason">
                What should admins look at?
              </label>
              <textarea
                id="report-reason"
                rows={3}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Inappropriate content, privacy concern, accidental upload…"
                className="field resize-none"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportItem(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={executeReport}
                  disabled={reportLoading || !reportReason.trim()}
                >
                  {reportLoading ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ----------------------------------------------------------- convert */}
      <Modal open={Boolean(convertToEventItem)} onClose={() => setConvertToEventItem(null)} size="md" label="Convert to event">
        <ModalHeader
          icon={<Sparkles className="h-4 w-4" />}
          eyebrow="Elevate"
          title={convertToEventItem?.type === 'collection_card' ? 'Turn collection into event' : 'Turn memory into event'}
          subtitle="Events get attendance, a place and shared guest notes."
          onClose={() => setConvertToEventItem(null)}
        />
        <form onSubmit={executeConvertToEvent} className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="event-title">
              Event title
            </label>
            <input
              id="event-title"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Sunday lake picnic"
              className="field"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5" htmlFor="event-date">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input
                id="event-date"
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label flex items-center gap-1.5" htmlFor="event-place">
                <MapPin className="h-3 w-3" /> Place
              </label>
              <input
                id="event-place"
                value={eventPlace}
                onChange={(e) => setEventPlace(e.target.value)}
                placeholder="Lakeside park"
                className="field"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConvertToEventItem(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={convertingLoading}>
              <Sparkles className="h-3.5 w-3.5" />
              {convertingLoading ? 'Converting…' : 'Convert to event'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --------------------------------------------------------- permissions */}
      {permissionsItem && (
        <ViewingPermissionsModal
          item={permissionsItem}
          isOpen={Boolean(permissionsItem)}
          onClose={() => setPermissionsItem(null)}
          groups={groups}
          onPermissionsUpdated={() => onMemoryUpdated?.()}
        />
      )}
    </div>
  );
};
