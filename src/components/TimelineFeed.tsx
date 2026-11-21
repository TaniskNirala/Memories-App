import React, { useState, useMemo, useEffect } from 'react';
import { FeedItem, SinglePostFeedItem, Group } from '../types/index.ts';
import {
  Lock,
  ChevronDown,
  Check,
  Sparkles,
  MessageSquare,
  Layers,
  Trash2,
  MoreVertical,
  Calendar,
  AlertTriangle,
  X,
  Flag,
  Share2,
  Grid,
  Images,
  MapPin,
  ShieldAlert,
  SlidersHorizontal,
  CheckCircle2,
  RefreshCw,
  Play,
  Maximize2,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { ViewingPermissionsModal } from './ViewingPermissionsModal.tsx';
import { isVideoMedia, getVideoPosterUrl } from '../utils/videoThumbnail.ts';
import { TgDeletedBadge } from './TgDeletedBadge.tsx';

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
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [openOptionsMenuId, setOpenOptionsMenuId] = useState<string | null>(null);
  const [sharingLoadingId, setSharingLoadingId] = useState<string | null>(null);

  // Modals state
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

  // Delete protection capability
  const [isDeleteProtected, setIsDeleteProtected] = useState(true);

  useEffect(() => {
    apiFetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.isDeleteProtected === 'boolean') {
          setIsDeleteProtected(cfg.isDeleteProtected);
        }
      })
      .catch(() => {});
  }, []);

  // Dynamic Month & Year Grouping based on actual memory dates
  const groupedSections = useMemo(() => {
    const groupsMap = new Map<string, FeedItem[]>();

    for (const item of items) {
      const rawDate = item.type === 'single_post' ? item.takenAt : (item.eventDate || item.sortDate);
      let monthYear = 'Recent Memories';
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }

      if (!groupsMap.has(monthYear)) {
        groupsMap.set(monthYear, []);
      }
      groupsMap.get(monthYear)!.push(item);
    }

    return Array.from(groupsMap.entries()).map(([monthYear, groupItems]) => ({
      monthYear,
      items: groupItems,
    }));
  }, [items]);

  const formatTimelineDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate();
      const month = d.toLocaleString('en-US', { month: 'short' });
      const year = d.getFullYear();
      const currentYear = new Date().getFullYear();
      if (year !== currentYear) {
        return `${day} ${month} ${year}`;
      }
      return `${day} ${month}`;
    } catch {
      return dateStr;
    }
  };

  const getDotColor = (authorName: string) => {
    const name = authorName.toLowerCase();
    if (name.includes('aarav')) return 'bg-sky-400 ring-sky-400/30';
    if (name.includes('riya')) return 'bg-rose-400 ring-rose-400/30';
    if (name.includes('kabir')) return 'bg-emerald-400 ring-emerald-400/30';
    return 'bg-amber-400 ring-amber-400/30';
  };

  const handleShareClick = async (itemId: string, itemType: 'post' | 'album', targetGroupId: string) => {
    setSharingLoadingId(itemId);
    setOpenDropdownId(null);
    try {
      await onShareToGroup(itemId, itemType, targetGroupId);
    } finally {
      setSharingLoadingId(null);
    }
  };

  const executeDelete = async (permanent: boolean) => {
    if (!deleteConfirmItem) return;
    setDeleteLoading(true);
    try {
      if (deleteConfirmItem.type === 'single_post') {
        if (onDeletePost) {
          await onDeletePost(deleteConfirmItem.id, permanent);
        }
      } else {
        if (onDeleteAlbum) {
          await onDeleteAlbum(deleteConfirmItem.id, permanent);
        }
      }
      setDeleteConfirmItem(null);
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
        body: JSON.stringify({
          caption: editItem.caption,
          takenAt: new Date(editItem.takenAt).toISOString(),
        }),
      });
      if (res.ok) {
        setEditItem(null);
        if (onMemoryUpdated) onMemoryUpdated();
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
        }, 1200);
      }
    } finally {
      setReportLoading(false);
    }
  };

  const handleRemoveFromCircle = async (item: FeedItem, groupId: string) => {
    const placement = item.placements?.find((p) => p.groupId === groupId);
    const circleName = placement?.groupName || groups.find((g) => g.id === groupId)?.name || 'circle';

    // Optimistically update placement list locally
    if (item.placements) {
      item.placements = item.placements.filter((p) => p.groupId !== groupId);
    }

    try {
      let res;
      if (placement && placement.id) {
        res = await apiFetch(`/api/placements/${placement.id}`, { method: 'DELETE' });
      } else {
        const itemType = item.type === 'single_post' ? 'post' : 'album';
        res = await apiFetch('/api/placements/remove-by-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id, itemType, groupId }),
        });
      }

      if (res && res.ok) {
        setToastMessage(`Removed from "${circleName}"`);
        setTimeout(() => setToastMessage(null), 3000);
        if (onMemoryUpdated) {
          onMemoryUpdated();
        }
      } else {
        const errData = await res?.json().catch(() => ({}));
        setToastMessage(errData?.error || `Failed to remove from "${circleName}"`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (e: any) {
      console.error('Failed to remove from circle', e);
      setToastMessage('Error removing from circle');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const executeConvertToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertToEventItem) return;
    setConvertingLoading(true);
    try {
      if (convertToEventItem.type === 'collection_card') {
        const res = await apiFetch(`/api/albums/${convertToEventItem.id}/convert-to-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: eventTitle.trim() || convertToEventItem.title,
            eventDate,
            eventPlace,
          }),
        });
        if (res.ok) {
          setConvertToEventItem(null);
          if (onMemoryUpdated) onMemoryUpdated();
        }
      } else {
        const res = await apiFetch(`/api/posts/${convertToEventItem.id}/convert-to-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: eventTitle,
            eventDate,
            eventPlace,
          }),
        });
        if (res.ok) {
          setConvertToEventItem(null);
          if (onMemoryUpdated) onMemoryUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to convert to event:', err);
    } finally {
      setConvertingLoading(false);
    }
  };

  return (
    <div className="relative pl-6 sm:pl-8 py-2">
      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-black/90 border border-amber-500/40 text-amber-300 text-xs font-semibold shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Continuous vertical timeline rail line */}
      <div className="absolute left-2.5 sm:left-3 top-6 bottom-4 w-0.5 bg-[var(--border-color)] opacity-80" />

      {/* Empty State */}
      {items.length === 0 && (
        <div className="p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] space-y-3 shadow-md">
          {isFiltered ? (
            <>
              <p className="text-xs text-[var(--text-muted)] font-medium">
                No memories match your search query or active filters.
              </p>
              {onResetFilters && (
                <button
                  onClick={onResetFilters}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 transition active:scale-95 shadow-xs"
                >
                  Clear Filters
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--text-muted)] font-medium">No memories in this circle yet.</p>
              <button
                onClick={onOpenUpload}
                className="px-4 py-2 rounded-xl bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 transition active:scale-95 shadow-xs"
              >
                Upload a Memory
              </button>
            </>
          )}
        </div>
      )}

      {/* Grouped Month Sections */}
      {groupedSections.map((section) => (
        <div key={section.monthYear} className="space-y-6 mb-8">
          {/* Dynamic Month Year Section Header */}
          <div className="relative flex items-center gap-2 mb-4">
            <div className="w-3.5 h-3.5 rounded-xs bg-amber-500 shadow-xs -ml-[19px] sm:-ml-[25px] shrink-0" />
            <span className="font-display font-bold text-sm sm:text-base text-[var(--text-primary)] tracking-wide">
              {section.monthYear}
            </span>
          </div>

          {/* Items in this Month */}
          <div className="space-y-6">
            {section.items.map((item) => {
              const dateStr = item.type === 'single_post' ? item.takenAt : (item.eventDate || item.sortDate);
              const author = item.type === 'single_post' ? item.owner : item.creator;
              const authorName = author?.displayName || author?.username || 'User';
              const mainFile = item.type === 'single_post' ? item.files[0] : null;

              const isOwner =
                user?.id === author?.id ||
                user?.id === (item as any)?.owner_id ||
                user?.id === (item as any)?.creator_id;
              const isAdmin = user?.role === 'admin';
              const canDelete = isOwner || isAdmin;

              // Resolve group name for header tag
              const hasPlacements = item.placements && item.placements.length > 0;
              const placementNames = hasPlacements
                ? item.placements.map((p) => p.groupName).join(', ')
                : 'Personal (Only You)';

              return (
                <div key={item.id} className="relative group">
                  {/* Timeline Connector Dot */}
                  <div
                    className={`absolute -left-[29px] sm:-left-[35px] top-4 w-3.5 h-3.5 rounded-full ring-4 ${getDotColor(
                      authorName
                    )} shadow-xs z-10`}
                  />

                  {/* Card Container */}
                  <div className="w-full rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-amber)]/40 transition-all p-4 shadow-lg text-[var(--text-primary)] relative">
                    {/* Header Meta & Options */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-medium truncate">
                        <span>{formatTimelineDate(dateStr)}</span>
                        <span className="font-semibold text-[var(--text-secondary)]">{authorName}</span>
                        <span>in</span>
                        <span className={hasPlacements ? "text-[var(--accent-cyan)] font-semibold truncate max-w-[150px] sm:max-w-[220px]" : "text-neutral-400 font-medium truncate max-w-[150px] sm:max-w-[220px]"}>
                          {placementNames}
                        </span>
                      </div>

                      {/* Card Options Menu (Three Dots) */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() =>
                            setOpenOptionsMenuId(openOptionsMenuId === item.id ? null : item.id)
                          }
                          aria-label="Memory options"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openOptionsMenuId === item.id && (
                          <div className="absolute right-0 top-8 w-52 p-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl z-30 space-y-1 animate-in fade-in zoom-in-95 duration-100 text-xs">
                            {/* Edit Date / Caption (for author or admin) */}
                            {canDelete && item.type === 'single_post' && (
                              <button
                                onClick={() => {
                                  setOpenOptionsMenuId(null);
                                  setEditItem({
                                    id: item.id,
                                    caption: item.caption || '',
                                    takenAt: item.takenAt
                                      ? new Date(item.takenAt).toISOString().slice(0, 10)
                                      : new Date().toISOString().slice(0, 10),
                                  });
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] transition flex items-center gap-2 text-[var(--text-primary)]"
                              >
                                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                                <span>Edit Date & Caption</span>
                              </button>
                            )}

                            {/* Convert Album or Post to Event */}
                            {canDelete && (item.type === 'single_post' || (item.type === 'collection_card' && !item.isEvent)) && (
                              <button
                                onClick={() => {
                                  setOpenOptionsMenuId(null);
                                  const defaultTitle = item.type === 'single_post' ? (item.caption || 'Event Memory') : item.title;
                                  const rawDate = item.type === 'single_post' ? item.takenAt : (item.eventDate || item.sortDate);
                                  setEventTitle(defaultTitle);
                                  setEventDate(rawDate ? new Date(rawDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
                                  setEventPlace(item.type === 'collection_card' ? (item.eventPlace || '') : '');
                                  setConvertToEventItem(item);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] transition flex items-center gap-2 text-amber-300"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                <span>Convert to Event</span>
                              </button>
                            )}

                            {/* Circles & Permissions Management */}
                            {canDelete && (
                              <button
                                onClick={() => {
                                  setOpenOptionsMenuId(null);
                                  setPermissionsItem(item);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] transition flex items-center gap-2 text-[var(--text-primary)]"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                                <span>Circles & Permissions</span>
                              </button>
                            )}

                            {/* Direct Remove from Circle options */}
                            {canDelete && (
                              <div className="pt-1 mt-1 border-t border-[var(--border-color)] space-y-0.5">
                                {item.placements && item.placements.length > 0 ? (
                                  <>
                                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] px-2 py-0.5 block tracking-wider">
                                      Remove from Circle:
                                    </span>
                                    {item.placements.map((pl) => (
                                      <button
                                        key={pl.id || pl.groupId}
                                        onClick={() => {
                                          setOpenOptionsMenuId(null);
                                          handleRemoveFromCircle(item, pl.groupId);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 transition flex items-center justify-between text-xs"
                                        title={`Remove memory from ${pl.groupName}`}
                                      >
                                        <span className="truncate">Remove from {pl.groupName}</span>
                                        <X className="w-3.5 h-3.5 shrink-0 ml-1.5 opacity-80" />
                                      </button>
                                    ))}
                                  </>
                                ) : selectedGroupId ? (
                                  <button
                                    onClick={() => {
                                      setOpenOptionsMenuId(null);
                                      handleRemoveFromCircle(item, selectedGroupId);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/15 text-rose-400 transition flex items-center justify-between text-xs"
                                  >
                                    <span className="truncate">Remove from this Circle</span>
                                    <X className="w-3.5 h-3.5 shrink-0 ml-1.5 opacity-80" />
                                  </button>
                                ) : null}
                              </div>
                            )}

                            {/* Deletion: Protected in preview; active on Render */}
                            {canDelete && (
                              isDeleteProtected ? (
                                <div
                                  className="px-2.5 py-1.5 text-[10px] text-amber-400 font-medium flex items-center gap-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20"
                                  title="Deletion is locked in AI Studio preview to safeguard your uploaded photos. Delete is fully operational on Render."
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                  <span>Delete locked in preview</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setOpenOptionsMenuId(null);
                                    setDeleteConfirmItem(item);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{item.type === 'collection_card' ? 'Delete Event' : 'Delete Memory'}</span>
                                </button>
                              )
                            )}

                            {/* Report memory (for other circle members) */}
                            {!isOwner && (
                              <button
                                onClick={() => {
                                  setOpenOptionsMenuId(null);
                                  setReportItem(item);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-amber-400 transition flex items-center gap-2"
                              >
                                <Flag className="w-3.5 h-3.5" />
                                <span>Report inappropriate</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3
                      onClick={() => {
                        if (item.type === 'single_post' && item.isLockedPlaceholder) return;
                        if (item.type === 'collection_card') onOpenCollection(item.id);
                        else if (item.type === 'single_post' && item.files.length > 1) onOpenViewer(item, 0, 'grid');
                        else onOpenViewer(item, 0, 'expanded');
                      }}
                      className={`font-display font-bold text-base sm:text-lg text-[var(--text-primary)] mb-3 ${
                        item.type === 'single_post' && item.isLockedPlaceholder
                          ? 'cursor-default'
                          : 'hover:text-amber-400 transition cursor-pointer'
                      }`}
                    >
                      {item.type === 'single_post' ? item.caption || 'Memory' : item.title}
                    </h3>

                    {/* LOCKED PLACEHOLDER CASE */}
                    {item.type === 'single_post' && item.isLockedPlaceholder ? (
                      <div className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden bg-[#121226] border border-amber-500/40 p-6 flex flex-col items-center justify-center text-center space-y-2.5 mb-3 shadow-inner">
                        <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm">
                          <Lock className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 max-w-sm px-2">
                          <span className="font-display font-bold text-sm text-amber-400 block">
                            Locked Memory
                          </span>
                          <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                            {item.lockedReason || `${authorName} hasn't approved sharing this to this circle yet.`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Media Display: Responsive Collage for Multi-Photos or Cover Mosaic */}
                        {item.type === 'single_post' ? (
                          <PostCollage item={item} onOpenViewer={onOpenViewer} />
                        ) : (
                          /* Collection cover collage / mosaic grid */
                          <div
                            onClick={() => onOpenCollection(item.id)}
                            className={`w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden cursor-pointer mb-3 bg-neutral-950 border border-[var(--border-color)] relative ${
                              !item.mosaicUrls || item.mosaicUrls.length <= 1
                                ? 'flex'
                                : item.mosaicUrls.length === 2
                                ? 'grid grid-cols-2 gap-1.5'
                                : item.mosaicUrls.length === 3
                                ? 'grid grid-cols-3 gap-1.5'
                                : 'grid grid-cols-2 gap-1.5'
                            }`}
                          >
                            {item.mosaicUrls && item.mosaicUrls.length > 0 ? (
                              item.mosaicUrls.slice(0, 4).map((mUrl, idx) => (
                                <div key={idx} className="relative w-full h-full overflow-hidden bg-neutral-900 group/mosaic">
                                  <img
                                    src={mUrl}
                                    alt={`Preview ${idx + 1}`}
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      if (!target.dataset.triedFallback && mUrl.includes('key=')) {
                                        target.dataset.triedFallback = 'true';
                                        try {
                                          const keyParam = new URL(mUrl, window.location.origin).searchParams.get('key');
                                          if (keyParam) target.src = `/api/storage/view?key=${encodeURIComponent(keyParam)}`;
                                        } catch {}
                                      }
                                    }}
                                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                                  />
                                  {idx === 3 && item.itemCount > 4 && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center font-bold text-white text-xs sm:text-sm">
                                      +{item.itemCount - 3} photos
                                    </div>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                                <Calendar className="w-6 h-6 mr-1" />
                                <span>Event Preview</span>
                              </div>
                            )}
                            {item.itemCount > 1 && item.mosaicUrls && item.mosaicUrls.length === 1 && (
                              <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-semibold text-white border border-white/10 flex items-center gap-1 shadow-md">
                                <Images className="w-3.5 h-3.5 text-amber-400" />
                                <span>{item.itemCount} Photos</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Footer Action Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Comments pill */}
                        <button
                          onClick={() => onOpenComments(item)}
                          className="px-3 py-1 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium flex items-center gap-1.5 transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                          <span>Comments ({item.type === 'single_post' ? item.commentsCount : 0})</span>
                        </button>

                        {/* Open button for collections */}
                        {item.type === 'collection_card' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onOpenCollection(item.id)}
                              className="px-3 py-1 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition cursor-pointer"
                            >
                              View Event
                            </button>

                            {!item.isEvent && (
                              <button
                                onClick={() => onOpenCollection(item.id)}
                                className="px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-rose-500/15 hover:from-amber-500/25 hover:to-rose-500/25 border border-amber-500/30 text-amber-300 font-medium transition flex items-center gap-1 cursor-pointer text-xs"
                                title="Convert into an interactive event"
                              >
                                <Sparkles className="w-3 h-3 text-amber-400" />
                                <span>Convert to Event</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Share to a group dropdown button */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenDropdownId(openDropdownId === item.id ? null : item.id)
                            }
                            disabled={sharingLoadingId === item.id}
                            className="px-3 py-1 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium flex items-center gap-1 transition"
                          >
                            <Share2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>{sharingLoadingId === item.id ? 'Sharing...' : 'Share to a group'}</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Dropdown Menu */}
                          {openDropdownId === item.id && (
                            <div className="absolute left-0 bottom-full mb-1 w-52 p-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl z-30 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-2 py-1 block">
                                Share into Circle:
                              </span>
                              {groups.map((g) => {
                                const alreadyInGroup = item.placements?.some((p) => p.groupId === g.id);
                                return (
                                  <button
                                    key={g.id}
                                    onClick={() =>
                                      handleShareClick(item.id, item.type === 'single_post' ? 'post' : 'album', g.id)
                                    }
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-[var(--bg-surface-elevated)] transition flex items-center justify-between text-[var(--text-primary)]"
                                  >
                                    <span className="truncate">{g.name}</span>
                                    {alreadyInGroup && (
                                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Direct Delete Button on Card (if owner or admin) */}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteConfirmItem(item)}
                          title="Delete memory"
                          className="px-2.5 py-1 rounded-full bg-[var(--bg-surface)] hover:bg-rose-500/20 border border-[var(--border-color)] text-[var(--text-muted)] hover:text-rose-400 font-medium flex items-center gap-1 transition shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* --- Delete Confirmation Modal --- */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>Delete Memory</span>
              </div>
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              How would you like to delete{' '}
              <strong>"{deleteConfirmItem.type === 'single_post' ? deleteConfirmItem.caption || 'this memory' : deleteConfirmItem.title}"</strong>?
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => executeDelete(false)}
                disabled={deleteLoading}
                className="w-full py-2.5 px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-amber-500/20 border border-[var(--border-color)] text-xs text-left font-medium text-[var(--text-primary)] transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block text-amber-400">Move to Trash</span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Safely recoverable for 30 days from your Trash Bin
                  </span>
                </div>
              </button>

              <button
                onClick={() => executeDelete(true)}
                disabled={deleteLoading}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-xs text-left font-medium text-rose-400 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block text-rose-400">Delete Forever</span>
                  <span className="text-[10px] text-rose-300/70">
                    Permanently delete and remove photo files immediately
                  </span>
                </div>
              </button>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Date & Caption Modal --- */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <Calendar className="w-4 h-4" />
                <span>Edit Memory Date & Caption</span>
              </div>
              <button
                onClick={() => setEditItem(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Date Taken
                </label>
                <input
                  type="date"
                  value={editItem.takenAt}
                  onChange={(e) => setEditItem({ ...editItem, takenAt: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Caption / Title
                </label>
                <textarea
                  rows={2}
                  value={editItem.caption}
                  onChange={(e) => setEditItem({ ...editItem, caption: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditItem(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                onClick={executeEdit}
                disabled={editLoading}
                className="px-4 py-1.5 rounded-xl bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition"
              >
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Report Inappropriate Modal --- */}
      {reportItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <Flag className="w-4 h-4" />
                <span>Report Memory</span>
              </div>
              <button
                onClick={() => setReportItem(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="py-4 text-center text-xs text-emerald-400 font-semibold space-y-1">
                <Check className="w-6 h-6 mx-auto mb-1" />
                <p>Report submitted to administrators. Thank you.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  Why should admins review this memory?
                </p>
                <textarea
                  rows={3}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Inappropriate content, offensive, privacy concern..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                />
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setReportItem(null)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeReport}
                    disabled={reportLoading || !reportReason.trim()}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition"
                  >
                    {reportLoading ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Convert Memory / Album to Event Modal --- */}
      {convertToEventItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-[#16162a] border border-[#2b2b52] rounded-3xl p-5 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>
                  {convertToEventItem.type === 'collection_card' ? 'Convert Album to Event' : 'Convert Memory to Event'}
                </span>
              </div>
              <button
                onClick={() => setConvertToEventItem(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Transform this {convertToEventItem.type === 'collection_card' ? 'album' : 'memory'} into an official Event with guest attendance check-ins and shared guest memory notes.
            </p>

            <form onSubmit={executeConvertToEvent} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="e.g. Summer Family Picnic, Birthday Celebration"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" /> Event Date
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" /> Location / Place
                  </label>
                  <input
                    type="text"
                    value={eventPlace}
                    onChange={(e) => setEventPlace(e.target.value)}
                    placeholder="e.g. Central Park"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setConvertToEventItem(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={convertingLoading}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-semibold hover:opacity-95 disabled:opacity-40 transition shadow-md flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{convertingLoading ? 'Converting...' : 'Convert to Event'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Viewing Permissions Modal (Circles Management) */}
      {permissionsItem && (
        <ViewingPermissionsModal
          item={permissionsItem}
          isOpen={Boolean(permissionsItem)}
          onClose={() => setPermissionsItem(null)}
          groups={groups}
          onPermissionsUpdated={() => {
            if (onMemoryUpdated) onMemoryUpdated();
          }}
        />
      )}
    </div>
  );
};
