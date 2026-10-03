import React, { useState, useEffect, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
  Trash2,
  Shield,
  Calendar,
  MessageSquare,
  AlertCircle,
  Grid,
  Maximize2,
  Images,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { FeedItem } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface MediaViewerModalProps {
  item: FeedItem | null;
  initialIndex?: number;
  initialMode?: 'grid' | 'expanded';
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
  initialMode,
  isOpen,
  onClose,
  onOpenComments,
  onOpenShareModal,
  onDeletePost,
  onOverrideVisibility,
}) => {
  const { user, isAdmin } = useAuth();
  const [fileIndex, setFileIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<'grid' | 'expanded'>('expanded');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageViewportRef = useRef<HTMLDivElement>(null);

  // Reset fileIndex and viewMode on prop updates
  useEffect(() => {
    setFileIndex(initialIndex);
    setShowDeleteConfirm(false);
    if (initialMode) {
      setViewMode(initialMode);
    } else if (item && item.type === 'single_post' && item.files.length > 1) {
      setViewMode('grid');
    } else {
      setViewMode('expanded');
    }
  }, [initialIndex, initialMode, item]);

  // Reset zoom & pan when switching photos, changing mode, or changing item
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  }, [fileIndex, item, viewMode]);

  // Gesture listener via @use-gesture/react for pinch-to-zoom, pan drag, and scroll-to-zoom
  useGesture(
    {
      onPinch: ({ offset: [scale], event }) => {
        if (event && 'preventDefault' in event) {
          try {
            event.preventDefault();
          } catch {}
        }
        const nextZoom = Math.min(Math.max(1, scale), 6);
        setZoom(nextZoom);
        if (nextZoom <= 1.05) {
          setPan({ x: 0, y: 0 });
        }
      },
      onDrag: ({ offset: [x, y], dragging }) => {
        setIsDragging(Boolean(dragging));
        if (zoom > 1.05) {
          setPan({ x, y });
        }
      },
      onWheel: ({ delta: [, dy], event }) => {
        if (event && 'preventDefault' in event) {
          try {
            event.preventDefault();
          } catch {}
        }
        const zoomFactor = dy < 0 ? 1.15 : 0.87;
        setZoom((prevZoom) => {
          const nextZoom = Math.min(Math.max(1, prevZoom * zoomFactor), 6);
          if (nextZoom <= 1.05) {
            setPan({ x: 0, y: 0 });
            return 1;
          }
          return nextZoom;
        });
      },
    },
    {
      target: imageViewportRef,
      eventOptions: { passive: false },
      pinch: {
        scaleBounds: { min: 1, max: 6 },
        from: () => [zoom, 0],
        modifierKey: null,
      },
      drag: {
        from: () => [pan.x, pan.y],
        filterTaps: true,
      },
    }
  );

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else if (viewMode === 'expanded' && item?.type === 'single_post' && item.files.length > 1) {
          setViewMode('grid');
        } else {
          onClose();
        }
        return;
      }

      // Zoom keyboard shortcuts
      if (viewMode === 'expanded') {
        if (e.key === '+' || e.key === '=') {
          setZoom((z) => Math.min(6, z + 0.5));
          return;
        }
        if (e.key === '-' || e.key === '_') {
          setZoom((z) => {
            const next = Math.max(1, z - 0.5);
            if (next <= 1.05) setPan({ x: 0, y: 0 });
            return next;
          });
          return;
        }
        if (e.key === '0') {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          return;
        }
      }

      // Next / Previous Photo
      if (viewMode === 'expanded' && item?.type === 'single_post') {
        if (e.key === 'ArrowRight') {
          setFileIndex((prev) => (prev + 1) % item.files.length);
        }
        if (e.key === 'ArrowLeft') {
          setFileIndex((prev) => (prev - 1 + item.files.length) % item.files.length);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, item, viewMode, zoom, onClose]);

  if (!isOpen || !item) return null;
  if (item.type !== 'single_post') return null;

  const files = item.files || [];
  const currentFile = files[fileIndex] || files[0];
  const isOwner = user?.id === item.owner.id;
  const canDelete = isOwner || isAdmin;
  const hasMultiplePhotos = files.length > 1;

  // Double click to toggle zoom (1x <-> 2.5x)
  const handleDoubleClick = () => {
    if (zoom > 1.1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-150 select-none">
      {/* Top action bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3.5 sm:p-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent">
        {/* Left: Author & Album info */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0"
            style={{ backgroundColor: item.owner.avatarColor }}
          >
            {item.owner.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white block">{item.owner.displayName}</span>
              {hasMultiplePhotos && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1">
                  <Images className="w-3 h-3" />
                  {files.length} Photos Album
                </span>
              )}
            </div>
            <span className="text-[11px] text-neutral-400">@{item.owner.username}</span>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2">
          {/* Toggle between Grid View & Expanded View for multi-photo albums */}
          {hasMultiplePhotos && (
            <div className="flex items-center bg-white/10 rounded-full p-0.5 border border-white/10">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'grid'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-300 hover:text-white'
                }`}
                title="View All Photos as Grid"
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Album Grid</span>
              </button>

              <button
                onClick={() => setViewMode('expanded')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'expanded'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-300 hover:text-white'
                }`}
                title="Expanded Lightbox View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Expanded</span>
              </button>
            </div>
          )}

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
                <div className="absolute right-0 mt-2 w-48 p-2 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-40 text-xs text-white">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block px-2 py-1">
                    Admin Visibility Override
                  </span>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, 'public_all');
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-neutral-800"
                  >
                    Make Visible to Everyone
                  </button>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, 'hidden');
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-neutral-800 text-rose-400"
                  >
                    Hide from all non-admins
                  </button>
                  <button
                    onClick={() => {
                      onOverrideVisibility(item.id, null);
                      setShowOverrideMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400"
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

          {/* Close Modal */}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition ml-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: ALBUM GRID OVERVIEW                              */}
      {/* ======================================================== */}
      {viewMode === 'grid' && hasMultiplePhotos && (
        <div className="relative w-full h-full flex flex-col items-center pt-20 pb-8 px-4 sm:px-8 overflow-y-auto">
          <div className="w-full max-w-4xl space-y-5 my-auto">
            {/* Album Header Banner */}
            <div className="bg-neutral-900/80 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl backdrop-blur-md">
              <div>
                {item.caption ? (
                  <h2 className="font-display font-bold text-lg sm:text-xl text-white">
                    {item.caption}
                  </h2>
                ) : (
                  <h2 className="font-display font-bold text-lg sm:text-xl text-neutral-300 italic">
                    Shared Memories Album
                  </h2>
                )}
                <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    {new Date(item.takenAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-semibold">{files.length} Photos</span>
                  {item.placements && item.placements.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-[var(--accent-coral)]">
                        {item.placements.map((p) => p.groupName).join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onOpenComments(item)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span>Comments ({item.commentsCount})</span>
                </button>

                <button
                  onClick={() => {
                    setFileIndex(0);
                    setViewMode('expanded');
                  }}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Expand All</span>
                </button>
              </div>
            </div>

            {/* Photo Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {files.map((file, idx) => (
                <div
                  key={file.id || idx}
                  onClick={() => {
                    setFileIndex(idx);
                    setViewMode('expanded');
                  }}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-amber-400/80 cursor-pointer shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-amber-500/10"
                >
                  <img
                    src={file.viewUrl || file.thumbUrl}
                    alt={`${item.caption || 'Memory'} ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.triedFallback && file.storageKey) {
                        target.dataset.triedFallback = 'true';
                        target.src = `/api/storage/view?key=${encodeURIComponent(file.storageKey)}`;
                      }
                    }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Corner Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono border border-white/10">
                    #{idx + 1}
                  </div>

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5 text-white">
                    <div className="w-9 h-9 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center shadow-md">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold">Click to expand</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: FULLSCREEN EXPANDED LIGHTBOX WITH ZOOM & PAN     */}
      {/* ======================================================== */}
      {(viewMode === 'expanded' || !hasMultiplePhotos) && (
        <div className="relative w-full h-full flex flex-col items-center justify-center pt-14 pb-28 sm:pb-32 overflow-hidden">
          {/* Floating Zoom Controls Bar */}
          <div className="absolute top-16 right-4 sm:top-18 sm:right-6 z-30 flex items-center gap-1 bg-black/80 backdrop-blur-md border border-white/20 rounded-full px-2 py-1 shadow-2xl text-white text-xs">
            <button
              onClick={() => {
                setZoom((z) => {
                  const next = Math.max(1, z - 0.5);
                  if (next <= 1.05) setPan({ x: 0, y: 0 });
                  return next;
                });
              }}
              disabled={zoom <= 1.05}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={resetZoom}
              className="px-2 py-0.5 text-[11px] font-mono hover:text-amber-400 transition"
              title="Click to reset zoom (0)"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
              disabled={zoom >= 6}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-95"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {zoom > 1.05 && (
              <button
                onClick={resetZoom}
                className="p-1 rounded-full hover:bg-white/20 text-neutral-300 hover:text-amber-400 transition ml-0.5 active:scale-95"
                title="Reset Zoom (1x)"
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
              </button>
            )}
          </div>

          {/* Interactive Zoom & Pan Viewport */}
          <div
            ref={imageViewportRef}
            onDoubleClick={handleDoubleClick}
            className={`relative w-full flex-1 flex items-center justify-center overflow-hidden px-4 sm:px-12 touch-none select-none ${
              zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
          >
            {currentFile && (
              <img
                src={currentFile.viewUrl || currentFile.thumbUrl}
                alt={item.caption || 'Memory view'}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.triedFallback && currentFile.storageKey) {
                    target.dataset.triedFallback = 'true';
                    target.src = `/api/storage/view?key=${encodeURIComponent(currentFile.storageKey)}`;
                  }
                }}
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0, 0.2, 1)',
                  maxHeight: '75vh',
                  maxWidth: '92vw',
                }}
                className="w-auto h-auto object-contain rounded-xl shadow-2xl select-none pointer-events-none will-change-transform"
              />
            )}

            {/* Helpful pan hint when zoomed in */}
            {zoom > 1.1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-neutral-300 text-[11px] font-medium pointer-events-none shadow-xl flex items-center gap-1.5 animate-in fade-in duration-150">
                <span>Scroll to zoom</span>
                <span>•</span>
                <span>Drag to pan</span>
                <span>•</span>
                <span>Double-click to reset</span>
              </div>
            )}
          </div>

          {/* Left & Right Navigation Arrows (only when not heavily zoomed) */}
          {hasMultiplePhotos && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFileIndex((prev) => (prev - 1 + files.length) % files.length);
                }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/70 hover:bg-amber-500 hover:text-neutral-950 text-white flex items-center justify-center transition border border-white/20 shadow-xl active:scale-95"
                title="Previous Photo (Left Arrow)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFileIndex((prev) => (prev + 1) % files.length);
                }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/70 hover:bg-amber-500 hover:text-neutral-950 text-white flex items-center justify-center transition border border-white/20 shadow-xl active:scale-95"
                title="Next Photo (Right Arrow)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Bottom Bar: Metadata, comments, and Filmstrip Reel */}
          <div className="absolute bottom-0 left-0 right-0 z-30 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/85 to-transparent text-white space-y-2.5">
            <div className="max-w-4xl mx-auto">
              {/* Caption & Comments Bar */}
              <div className="flex items-center justify-between gap-4">
                <div className="truncate">
                  {item.caption && (
                    <p className="text-sm font-semibold truncate mb-0.5">{item.caption}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      {new Date(item.takenAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {hasMultiplePhotos && (
                      <>
                        <span>•</span>
                        <span className="text-amber-300 font-medium">
                          Photo {fileIndex + 1} of {files.length}
                        </span>
                      </>
                    )}
                    {item.placements && item.placements.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-[var(--accent-coral)] font-medium">
                          {item.placements.map((p) => p.groupName).join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onOpenComments(item)}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold transition"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    <span>Comments ({item.commentsCount})</span>
                  </button>
                </div>
              </div>

              {/* Horizontal Thumbnail Filmstrip for Multi-Photo Albums */}
              {hasMultiplePhotos && (
                <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1 no-scrollbar justify-start sm:justify-center">
                  {files.map((f, idx) => (
                    <button
                      key={f.id || idx}
                      onClick={() => setFileIndex(idx)}
                      className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all duration-200 ${
                        idx === fileIndex
                          ? 'border-amber-400 scale-105 shadow-md shadow-amber-500/30 ring-2 ring-amber-400/40'
                          : 'border-white/20 opacity-60 hover:opacity-100 hover:border-white/60'
                      }`}
                    >
                      <img
                        src={f.viewUrl || f.thumbUrl}
                        alt={`Thumb ${idx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="w-full max-w-sm p-5 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl text-white">
            <h4 className="font-semibold text-sm mb-2 text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Delete Memory
            </h4>
            <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
              Choose how you want to remove this memory:
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
