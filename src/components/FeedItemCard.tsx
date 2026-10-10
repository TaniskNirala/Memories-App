import React, { useState } from 'react';
import { Calendar, MapPin, MessageSquare, MoreHorizontal, Share2, Layers, Users, Trash2 } from 'lucide-react';
import { FeedItem } from '../types/index.ts';
import { LockedPlaceholder } from './LockedPlaceholder.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface FeedItemCardProps {
  item: FeedItem;
  onOpenViewer: (item: FeedItem, initialFileIndex?: number) => void;
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenShareModal: (item: FeedItem) => void;
  onDeletePost?: (postId: string) => void;
  onReactionToggle?: (targetId: string, groupId: string, emoji: string) => void;
}

const EMOJI_LIST = ['❤️', '🔥', '😂', '👏', '🎉', '😮'];

export const FeedItemCard: React.FC<FeedItemCardProps> = ({
  item,
  onOpenViewer,
  onOpenComments,
  onOpenCollection,
  onOpenShareModal,
  onDeletePost,
  onReactionToggle,
}) => {
  const { user, isAdmin } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // If single post is a locked placeholder
  if (item.type === 'single_post' && item.isLockedPlaceholder) {
    return <LockedPlaceholder reason={item.lockedReason} ownerUsername={item.owner?.username} />;
  }

  // -------------------------------------------------------------
  // COLLECTION / EVENT CARD
  // -------------------------------------------------------------
  if (item.type === 'collection_card') {
    return (
      <div
        onClick={() => onOpenCollection(item.id)}
        className="w-full rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden cursor-pointer hover:border-[var(--accent-coral)]/40 transition-all playful-card mb-4 group"
      >
        {/* Cover Mosaic (dynamic layout based on photo count) */}
        <div
          className={`aspect-16/9 w-full bg-[var(--bg-surface)] overflow-hidden relative ${
            !item.mosaicUrls || item.mosaicUrls.length <= 1
              ? 'flex'
              : item.mosaicUrls.length === 2
              ? 'grid grid-cols-2 gap-0.5'
              : item.mosaicUrls.length === 3
              ? 'grid grid-cols-3 gap-0.5'
              : 'grid grid-cols-2 gap-0.5'
          }`}
        >
          {item.mosaicUrls && item.mosaicUrls.length > 0 ? (
            item.mosaicUrls.slice(0, 4).map((url, idx) => (
              <div key={idx} className="relative w-full h-full overflow-hidden bg-neutral-900">
                <img
                  src={url}
                  alt={`${item.title} preview ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {idx === 3 && item.itemCount > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center font-bold text-white text-xs">
                    +{item.itemCount - 3}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-xs">
              <Layers className="w-8 h-8 opacity-40 mb-1" />
            </div>
          )}
        </div>

        {/* Content Details */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-[var(--accent-coral)]">
              {item.isEvent ? 'Event' : 'Event'}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          <h3 className="font-display font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent-coral)] transition">
            {item.title}
          </h3>

          {item.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Event Metadata (unboxed text per anti-slop) */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
            {item.eventDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {item.eventDate}
              </span>
            )}
            {item.eventPlace && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {item.eventPlace}
                </span>
              </>
            )}
            {item.isEvent && item.attendeesCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {item.attendeesCount} attended
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>By @{item.creator.username}</span>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SINGLE POST CARD
  // -------------------------------------------------------------
  const mainFile = item.files[0];
  const isOwner = user?.id === item.owner.id;
  const canDelete = false; // Deletion is permanently disabled in this preview to protect memories
  const activeGroupId = item.activeGroupId || item.placements[0]?.groupId;

  return (
    <article className="w-full rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden playful-card mb-4">
      {/* Header: Author & Date & Options */}
      <div className="p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs"
            style={{ backgroundColor: item.owner.avatarColor }}
          >
            {item.owner.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--text-primary)]">
                {item.owner.displayName}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                @{item.owner.username}
              </span>
            </div>
            {/* Clean unboxed metadata with dot separators */}
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span>{new Date(item.takenAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              {item.placements && item.placements.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent-coral)] font-medium">
                    {item.placements[0].groupName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Options dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowMenu((prev) => !prev)}
            aria-label="Post actions"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-1 w-44 p-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl z-30 text-xs">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onOpenShareModal(item);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition text-left"
              >
                <Share2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Share to Circle</span>
              </button>

              {canDelete && onDeletePost && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDeletePost(item.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move to Trash</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media Content */}
      {mainFile && (
        <div
          onClick={() => onOpenViewer(item, 0)}
          className="relative w-full aspect-4/3 bg-neutral-950 flex items-center justify-center overflow-hidden cursor-pointer group"
        >
          {mainFile.fileType === 'photo' ? (
            <img
              src={mainFile.viewUrl || mainFile.thumbUrl}
              alt={item.caption || 'Memory photo'}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.triedFallback && mainFile.storageKey) {
                  target.dataset.triedFallback = 'true';
                  target.src = `/api/storage/view?key=${encodeURIComponent(mainFile.storageKey)}`;
                }
              }}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          ) : (
            <div className="text-white text-xs flex flex-col items-center">
              <span>Video / Audio Preview</span>
            </div>
          )}

          {item.files.length > 1 && (
            <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-xs rounded-lg text-[10px] font-mono font-medium text-white">
              +{item.files.length - 1} photos
            </div>
          )}
        </div>
      )}

      {/* Caption & Interactivity */}
      <div className="p-3.5">
        {item.caption && (
          <p className="text-xs text-[var(--text-primary)] leading-relaxed mb-3">
            {item.caption}
          </p>
        )}

        {/* Reactions & Comments Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-xs">
          {/* Reaction chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.reactions && item.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => activeGroupId && onReactionToggle && onReactionToggle(item.id, activeGroupId, r.emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition ${
                  r.userReacted
                    ? 'bg-amber-500/20 border border-amber-500/40 text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]'
                }`}
              >
                <span>{r.emoji}</span>
                <span className="text-[10px] font-mono">{r.count}</span>
              </button>
            ))}

            {/* Add reaction trigger */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition text-xs"
              >
                +
              </button>

              {showEmojiPicker && (
                <div className="absolute bottom-8 left-0 p-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl flex items-center gap-1 z-30">
                  {EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setShowEmojiPicker(false);
                        if (activeGroupId && onReactionToggle) {
                          onReactionToggle(item.id, activeGroupId, emoji);
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center hover:scale-125 transition text-sm"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comments drawer trigger */}
          <button
            onClick={() => onOpenComments(item)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent-coral)] transition font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{item.commentsCount > 0 ? item.commentsCount : 'Comment'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
