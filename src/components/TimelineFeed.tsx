import React, { useState } from 'react';
import { FeedItem, Group } from '../types/index.ts';
import { Lock, ChevronDown, Check, Sparkles, MessageSquare, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface TimelineFeedProps {
  items: FeedItem[];
  groups: Group[];
  selectedGroupId?: string;
  onOpenViewer: (item: FeedItem, initialIndex?: number) => void;
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (collectionId: string) => void;
  onShareToGroup: (itemId: string, itemType: 'post' | 'album', groupId: string) => Promise<void>;
  onOpenUpload: () => void;
}

export const TimelineFeed: React.FC<TimelineFeedProps> = ({
  items,
  groups,
  selectedGroupId,
  onOpenViewer,
  onOpenComments,
  onOpenCollection,
  onShareToGroup,
  onOpenUpload,
}) => {
  const { user } = useAuth();
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [sharingLoadingId, setSharingLoadingId] = useState<string | null>(null);

  const formatTimelineDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const day = d.getDate();
      const month = d.toLocaleString('en-US', { month: 'short' });
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

  return (
    <div className="relative pl-6 sm:pl-8 py-2">
      {/* Continuous vertical timeline rail line */}
      <div className="absolute left-2.5 sm:left-3 top-6 bottom-4 w-0.5 bg-[var(--border-color)] opacity-80" />

      {/* Month Year Header (e.g. September 2026) */}
      <div className="relative flex items-center gap-2 mb-6">
        <div className="w-3.5 h-3.5 rounded-xs bg-amber-500 shadow-xs -ml-[19px] sm:-ml-[25px] shrink-0" />
        <span className="font-display font-bold text-sm sm:text-base text-[var(--text-primary)] tracking-wide">
          September 2026
        </span>
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div className="p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] space-y-3 shadow-md">
          <p className="text-xs text-[var(--text-muted)] font-medium">No memories in this circle yet.</p>
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-xl bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 transition active:scale-95 shadow-xs"
          >
            Upload a Memory
          </button>
        </div>
      )}

      {/* Timeline Items */}
      <div className="space-y-6">
        {items.map((item) => {
          const dateStr = item.type === 'single_post' ? item.takenAt : (item.eventDate || item.sortDate);
          const author = item.type === 'single_post' ? item.owner : item.creator;
          const authorName = author?.displayName || author?.username || 'User';
          const mainFile = item.type === 'single_post' ? item.files[0] : null;

          // Resolve group name for header tag
          const placementNames = item.placements?.map((p) => p.groupName).join(', ') || 'Everyone';

          return (
            <div key={item.id} className="relative group">
              {/* Timeline Connector Dot */}
              <div
                className={`absolute -left-[29px] sm:-left-[35px] top-4 w-3.5 h-3.5 rounded-full ring-4 ${getDotColor(
                  authorName
                )} shadow-xs z-10`}
              />

              {/* Card Container */}
              <div className="w-full rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-amber)]/40 transition-all p-4 shadow-lg text-[var(--text-primary)]">
                {/* Header Meta: e.g. "21 Sept  Aarav  in Everyone" */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2 font-medium">
                  <span>{formatTimelineDate(dateStr)}</span>
                  <span className="font-semibold text-[var(--text-secondary)]">{authorName}</span>
                  <span>in</span>
                  <span className="text-[var(--accent-cyan)] font-semibold">{placementNames}</span>
                </div>

                {/* Title */}
                <h3
                  onClick={() => {
                    if (item.type === 'single_post' && item.isLockedPlaceholder) return;
                    if (item.type === 'collection_card') onOpenCollection(item.id);
                    else onOpenViewer(item, 0);
                  }}
                  className={`font-display font-bold text-base sm:text-lg text-[var(--text-primary)] mb-3 ${
                    item.type === 'single_post' && item.isLockedPlaceholder
                      ? 'cursor-default'
                      : 'hover:text-amber-400 transition cursor-pointer'
                  }`}
                >
                  {item.type === 'single_post' ? (item.caption || 'Memory') : item.title}
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
                    {/* Media Display */}
                    {item.type === 'single_post' ? (
                      <div
                        onClick={() => onOpenViewer(item, 0)}
                        className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden cursor-pointer bg-neutral-900 border border-[var(--border-color)] mb-3 group/media"
                      >
                        {mainFile ? (
                          <img
                            src={mainFile.viewUrl || mainFile.thumbUrl}
                            alt={item.caption || 'Memory photo'}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover/media:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-linear-to-r from-amber-700 to-amber-900 flex items-center justify-center">
                            <Sparkles className="w-8 h-8 text-amber-300 opacity-60" />
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Collection 2x2 cover mosaic grid */
                      <div
                        onClick={() => onOpenCollection(item.id)}
                        className="grid grid-cols-2 gap-1.5 w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden cursor-pointer mb-3 bg-neutral-950"
                      >
                        {item.mosaicUrls && item.mosaicUrls.length > 0 ? (
                          item.mosaicUrls.slice(0, 4).map((mUrl, idx) => (
                            <div key={idx} className="relative w-full h-full overflow-hidden bg-neutral-900">
                              <img
                                src={mUrl}
                                alt={`Preview ${idx}`}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 flex items-center justify-center text-xs text-[var(--text-muted)]">
                            <Layers className="w-6 h-6 mr-1" />
                            <span>Collection Preview</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Footer Action Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
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
                    <button
                      onClick={() => onOpenCollection(item.id)}
                      className="px-3 py-1 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition"
                    >
                      Open
                    </button>
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
                              onClick={() => handleShareClick(item.id, item.type === 'single_post' ? 'post' : 'album', g.id)}
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
