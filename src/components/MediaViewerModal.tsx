import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Share2, Trash2, Shield, Calendar, MapPin, MessageSquare, AlertCircle } from 'lucide-react';
import { FeedItem } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface MediaViewerModalProps {
  item: FeedItem | null;
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenComments: (item: FeedItem) => void;
  onOpenShareModal: (item: FeedItem) => void;
  onDeletePost: (postId: string, permanent?: boolean) => void;
  onOverrideVisibility?: (postId: string, override: string | null) => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  item,
  initialIndex = 0,
  isOpen,
  onClose,
  onOpenComments,
  onOpenShareModal,
  onDeletePost,
  onOverrideVisibility,
}) => {
  const { user, isAdmin } = useAuth();
  const [fileIndex, setFileIndex] = useState(initialIndex);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);

  useEffect(() => {
    setFileIndex(initialIndex);
    setShowDeleteConfirm(false);
  }, [initialIndex, item]);

  // Keyboard navigation (ESC to close, Left/Right arrow to cycle)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && item?.type === 'single_post') {
        setFileIndex((prev) => (prev + 1) % item.files.length);
      }
      if (e.key === 'ArrowLeft' && item?.type === 'single_post') {
        setFileIndex((prev) => (prev - 1 + item.files.length) % item.files.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, item, onClose]);

  if (!isOpen || !item) return null;

  if (item.type !== 'single_post') return null;

  const currentFile = item.files[fileIndex] || item.files[0];
  const isOwner = user?.id === item.owner.id;
  const canDelete = isOwner || isAdmin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-150">
      {/* Top action bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs"
            style={{ backgroundColor: item.owner.avatarColor }}
          >
            {item.owner.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-xs font-bold text-white block">{item.owner.displayName}</span>
            <span className="text-[11px] text-neutral-400">@{item.owner.username}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share to circle */}
          <button
            onClick={() => onOpenShareModal(item)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            title="Share to Circle"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Admin Visibility Override */}
          {isAdmin && onOverrideVisibility && (
            <div className="relative">
              <button
                onClick={() => setShowOverrideMenu((prev) => !prev)}
                className="p-2 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition"
                title="Admin Override Visibility"
              >
                <Shield className="w-4 h-4" />
              </button>

              {showOverrideMenu && (
                <div className="absolute right-0 mt-2 w-48 p-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-30 text-xs text-white">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block px-2 py-1">
                    Admin Visibility Override
                  </span>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, 'public_all');
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800"
                  >
                    Make Visible to Everyone
                  </button>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, 'hidden');
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-rose-400"
                  >
                    Hide from all non-admins
                  </button>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, null);
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-neutral-400"
                  >
                    Reset to Standard Circles
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Delete Button */}
          {canDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-full bg-white/10 hover:bg-rose-500/30 text-rose-400 transition"
              title="Delete Post"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Close Lightbox */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image View */}
      <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
        {currentFile && (
          <img
            src={currentFile.viewUrl || currentFile.thumbUrl}
            alt={item.caption || 'Memory view'}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl select-none"
          />
        )}

        {/* Carousel controls if multi-file */}
        {item.files.length > 1 && (
          <>
            <button
              onClick={() => setFileIndex((prev) => (prev - 1 + item.files.length) % item.files.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => setFileIndex((prev) => (prev + 1) % item.files.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Bottom info & comments drawer trigger */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white">
        <div className="max-w-2xl mx-auto flex items-end justify-between gap-4">
          <div>
            {item.caption && <p className="text-sm leading-relaxed mb-2 font-medium">{item.caption}</p>}
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(item.takenAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {item.placements && item.placements.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent-coral)] font-medium">
                    {item.placements.map((p) => p.groupName).join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => onOpenComments(item)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold shrink-0 transition"
          >
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <span>Comments ({item.commentsCount})</span>
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog: "The owner chooses each time between 'Move to trash' (recoverable for 30 days) and 'Delete forever'." */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm p-5 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl text-white">
            <h4 className="font-semibold text-sm mb-2 text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Delete Memory
            </h4>
            <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
              Choose how you want to remove this photo:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  onDeletePost(item.id, false);
                  onClose();
                }}
                className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-left transition flex items-center justify-between"
              >
                <span>Move to Trash</span>
                <span className="text-[10px] text-neutral-400">Recoverable for 30 days</span>
              </button>

              <button
                onClick={() => {
                  onDeletePost(item.id, true);
                  onClose();
                }}
                className="w-full py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-medium text-left transition flex items-center justify-between border border-rose-500/30"
              >
                <span>Delete Forever</span>
                <span className="text-[10px] text-rose-400/80">Purges files immediately</span>
              </button>

              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-2 text-center text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
