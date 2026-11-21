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
  Crop,
  Plus,
  Sparkles,
  MapPin,
  ShieldAlert,
  Play,
} from 'lucide-react';
import { FeedItem, Group } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { PhotoEditorModal, PhotoEditorResult } from './PhotoEditorModal.tsx';
import { AddPhotosToAlbumModal } from './AddPhotosToAlbumModal.tsx';
import { ViewingPermissionsModal } from './ViewingPermissionsModal.tsx';
import { CaptionSuggestionsModal } from './CaptionSuggestionsModal.tsx';
import { isVideoMedia, isAudioMedia, getVideoPosterUrl } from '../utils/videoThumbnail.ts';

interface MediaViewerModalProps {
  item: FeedItem | null;
  initialIndex?: number;
  initialMode?: 'grid' | 'expanded';
  isOpen: boolean;
  onClose: () => void;
  onOpenComments: (item: FeedItem) => void;
  onOpenShareModal: (item: FeedItem) => void;
  onDeletePost: (postId: string, permanent?: boolean) => void;
  onDeleteFile?: (postId: string, fileId: string) => Promise<void> | void;
  onPhotoUpdated?: (postId: string, updatedFile: any) => void;
  onOverrideVisibility?: (postId: string, override: string | null) => void;
  groups?: Group[];
  onPermissionsUpdated?: (updatedPlacements?: any[], visibilityOverride?: string | null) => void;
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
  onDeleteFile,
  onPhotoUpdated,
  onOverrideVisibility,
  groups = [],
  onPermissionsUpdated,
}) => {
  const { user, isAdmin } = useAuth();
  const [fileIndex, setFileIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<'grid' | 'expanded'>('expanded');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetPhoto, setDeleteTargetPhoto] = useState<{ id: string; index: number } | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [showOverrideMenu, setShowOverrideMenu] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAddPhotosModalOpen, setIsAddPhotosModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isCaptionSuggestionsOpen, setIsCaptionSuggestionsOpen] = useState(false);
  const [captionToast, setCaptionToast] = useState<string | null>(null);
  const [showConvertPostToEvent, setShowConvertPostToEvent] = useState(false);
  const [postEventTitle, setPostEventTitle] = useState('');
  const [postEventDate, setPostEventDate] = useState('');
  const [postEventPlace, setPostEventPlace] = useState('');
  const [isConvertingPost, setIsConvertingPost] = useState(false);
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

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const activePostIdRef = useRef<string | null>(null);

  // Reset fileIndex and viewMode only when opening a different item or when modal opens
  useEffect(() => {
    if (!isOpen || !item) {
      activePostIdRef.current = null;
      return;
    }

    if (activePostIdRef.current !== item.id) {
      // Opening modal on a NEW post: initialize view and index
      activePostIdRef.current = item.id;
      setFileIndex(initialIndex || 0);
      setShowDeleteConfirm(false);
      setDeleteTargetPhoto(null);
      if (initialMode) {
        setViewMode(initialMode);
      } else if (item.type === 'single_post' && item.files.length > 1) {
        setViewMode('grid');
      } else {
        setViewMode('expanded');
      }
    } else {
      // Same post updated (e.g. photo deleted):
      // Keep user in current viewMode and clamp fileIndex to remaining files
      const newCount = item.type === 'single_post' ? (item.files?.length || 1) : 1;
      setFileIndex((prev) => Math.max(0, Math.min(prev, newCount - 1)));
      setShowDeleteConfirm(false);
      setDeleteTargetPhoto(null);
    }
  }, [isOpen, item, initialIndex, initialMode]);

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

  const canDelete = (isOwner || isAdmin) && !isDeleteProtected;
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

  const handleSaveEditedPhoto = async (result: PhotoEditorResult) => {
    if (!currentFile || !item) return;

    try {
      const formData = new FormData();
      formData.append('file', result.blob, 'edited_photo.jpg');
      formData.append('thumb', result.thumbBlob, 'thumb_edited_photo.jpg');
      formData.append('width', String(result.width));
      formData.append('height', String(result.height));

      const res = await apiFetch(`/api/posts/${item.id}/files/${currentFile.id}`, {
        method: 'PUT',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.updatedFile) {
          // Update in-memory file record
          if (item.type === 'single_post') {
            item.files = item.files.map((f) => (f.id === currentFile.id ? data.updatedFile : f));
          }
          if (onPhotoUpdated) {
            onPhotoUpdated(item.id, data.updatedFile);
          }
          resetZoom();
        }
      }
    } catch (err) {
      console.error('Failed to save edited photo:', err);
    }
  };

  const handleSaveAndShareEditedPhoto = async (result: PhotoEditorResult) => {
    await handleSaveEditedPhoto(result);
    onOpenShareModal(item);
  };

  const handleAddPhotosSuccess = async () => {
    if (!item) return;
    try {
      const res = await apiFetch(`/api/posts/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.post && item.type === 'single_post') {
          item.files = data.post.files;
          if (onPhotoUpdated && data.post.files?.[0]) {
            onPhotoUpdated(item.id, data.post.files[0]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to refresh album after adding photos', e);
    }
  };

  const handleConvertPostToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setIsConvertingPost(true);
    try {
      const res = await apiFetch(`/api/posts/${item.id}/convert-to-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postEventTitle,
          eventDate: postEventDate,
          eventPlace: postEventPlace,
        }),
      });

      if (res.ok) {
        setCaptionToast('✨ Converted into an Event collection!');
        setShowConvertPostToEvent(false);
        if (onPermissionsUpdated) {
          onPermissionsUpdated();
        }
        setTimeout(() => {
          onClose();
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to convert post to event:', err);
    } finally {
      setIsConvertingPost(false);
    }
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
                  {files.length} Event Photos
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
                <span className="hidden sm:inline">Photo Grid</span>
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

          {/* Add More Photos to Event */}
          {(canDelete || isAdmin || item.owner?.id === user?.id) && (
            <button
              onClick={() => setIsAddPhotosModalOpen(true)}
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/30 text-amber-300 hover:text-white hover:border-amber-400 transition flex items-center gap-1.5 text-xs font-semibold shadow-xs"
              title="Add More Photos to this Event"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Add Photos</span>
            </button>
          )}

          {/* Photo Editor: Crop & Rotate */}
          {currentFile && (!currentFile.fileType || currentFile.fileType === 'photo') && (canDelete || isAdmin || item.owner?.id === user?.id) && (
            <button
              onClick={() => setIsEditorOpen(true)}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-amber-500/20 text-white hover:text-amber-300 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Crop & Rotate Photo"
            >
              <Crop className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Edit Photo</span>
            </button>
          )}

          {/* Share to circle */}
          <button
            onClick={() => onOpenShareModal(item)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            title="Share to Circle"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Adjust Viewing Permissions Button */}
          {(canDelete || isAdmin || item.owner?.id === user?.id) && (
            <button
              onClick={() => setIsPermissionsModalOpen(true)}
              className="px-3 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold shadow-xs"
              title="Adjust Viewing Permissions"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="inline">Permissions</span>
            </button>
          )}

          {/* AI Caption Suggestions Button (Opens suggestions review, never overrides) */}
          {(canDelete || isAdmin || item.owner?.id === user?.id) && item.type === 'single_post' && (
            <button
              onClick={() => setIsCaptionSuggestionsOpen(true)}
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 border border-amber-500/30 text-amber-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
              title="View AI caption suggestions (does not override)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Caption Ideas</span>
            </button>
          )}

          {/* Convert Album/Memory to Event Button */}
          {(canDelete || isAdmin || item.owner?.id === user?.id) && item.type === 'single_post' && (
            <button
              onClick={() => {
                setPostEventTitle(item.caption ? item.caption.slice(0, 50) : 'Event Memory');
                setPostEventDate(item.takenAt ? new Date(item.takenAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
                setPostEventPlace('');
                setShowConvertPostToEvent(true);
              }}
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 border border-amber-500/30 text-amber-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
              title="Convert this memory into an interactive event with attendees & notes"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">To Event</span>
            </button>
          )}

          {/* Preview delete lock badge */}
          {(isOwner || isAdmin) && isDeleteProtected && (
            <div
              className="px-2.5 py-1 text-[11px] text-amber-400 font-medium flex items-center gap-1.5 bg-amber-500/10 rounded-full border border-amber-500/20"
              title="Deletion is locked in AI Studio preview to safeguard your uploaded photos. Delete is fully available on Render."
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="hidden sm:inline">Delete locked in preview</span>
            </div>
          )}

          {/* Delete Buttons */}
          {canDelete && (
            <div className="flex items-center gap-1.5">
              {hasMultiplePhotos && currentFile && (
                <button
                  onClick={() => setDeleteTargetPhoto({ id: currentFile.id, index: fileIndex })}
                  className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-amber-500/25 text-amber-300 transition flex items-center gap-1.5 text-xs font-semibold"
                  title={`Delete Photo #${fileIndex + 1} only`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Delete Photo #{fileIndex + 1}</span>
                </button>
              )}

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-full bg-white/10 hover:bg-rose-500/30 text-rose-400 transition"
                title={hasMultiplePhotos ? "Delete Memory Options" : "Delete Memory"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
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

      {/* Caption Toast Notification */}
      {captionToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-emerald-500 text-neutral-950 font-bold text-xs shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 flex items-center gap-1.5 pointer-events-none">
          <Sparkles className="w-4 h-4 fill-current" />
          <span>{captionToast}</span>
        </div>
      )}

      {/* Convert Memory/Album to Event Modal Dialog */}
      {showConvertPostToEvent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#16162a] border border-[#2b2b52] rounded-3xl p-5 text-white space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-display font-bold text-sm text-white">Convert into Event Collection</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConvertPostToEvent(false)}
                className="text-neutral-400 hover:text-white text-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Transform this memory into an official Event collection with attendee check-ins and shared guest memory notes.
            </p>

            <form onSubmit={handleConvertPostToEvent} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={postEventTitle}
                  onChange={(e) => setPostEventTitle(e.target.value)}
                  placeholder="e.g. Summer Lake Trip, Birthday Party"
                  className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-400" /> Event Date
                  </label>
                  <input
                    type="date"
                    required
                    value={postEventDate}
                    onChange={(e) => setPostEventDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-rose-400" /> Location / Venue
                  </label>
                  <input
                    type="text"
                    value={postEventPlace}
                    onChange={(e) => setPostEventPlace(e.target.value)}
                    placeholder="e.g. Lake Tahoe"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowConvertPostToEvent(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-neutral-300 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConvertingPost}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-semibold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isConvertingPost ? 'Converting...' : 'Confirm & Convert'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    Event Photos
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
                {(canDelete || isAdmin || item.owner?.id === user?.id) && (
                  <button
                    onClick={() => {
                      setPostEventTitle(item.caption ? item.caption.slice(0, 50) : 'Event Memory');
                      setPostEventDate(item.takenAt ? new Date(item.takenAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
                      setPostEventPlace('');
                      setShowConvertPostToEvent(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    title="Convert this photo album into an event collection"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Convert to Event</span>
                  </button>
                )}

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
                  {isVideoMedia(file) ? (
                    <>
                      {getVideoPosterUrl(file) ? (
                        <img
                          src={getVideoPosterUrl(file)}
                          alt={`${item.caption || 'Video'} ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <video
                          src={file.viewUrl ? `${file.viewUrl}#t=0.1` : undefined}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 rounded-full bg-black/70 border border-white/25 flex items-center justify-center text-white shadow-lg">
                          <Play className="w-4 h-4 fill-current text-amber-400 ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
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
                  )}

                  {/* Corner Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono border border-white/10">
                    {isVideoMedia(file) ? `VIDEO #${idx + 1}` : `#${idx + 1}`}
                  </div>

                  {/* Edit Photo Button on Thumbnail in Grid */}
                  {(canDelete || isAdmin || item.owner?.id === user?.id) && (!file.fileType || file.fileType === 'photo') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFileIndex(idx);
                        setIsEditorOpen(true);
                      }}
                      className="absolute top-2 right-9 p-1.5 rounded-full bg-black/75 hover:bg-amber-500 text-neutral-300 hover:text-neutral-950 backdrop-blur-xs border border-white/20 transition opacity-0 group-hover:opacity-100 z-10 shadow-md"
                      title={`Crop & Rotate Photo #${idx + 1}`}
                    >
                      <Crop className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete Single Photo Button on Thumbnail in Grid */}
                  {canDelete && files.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTargetPhoto({ id: file.id, index: idx });
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 hover:bg-rose-600 text-neutral-300 hover:text-white backdrop-blur-xs border border-white/20 transition opacity-0 group-hover:opacity-100 z-10 shadow-md"
                      title={`Delete Photo #${idx + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5 text-white">
                    <div className="w-9 h-9 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center shadow-md">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold">Click to expand</span>
                  </div>
                </div>
              ))}

              {/* Add More Photos Card in Album Grid */}
              {(canDelete || isAdmin || item.owner?.id === user?.id) && (
                <div
                  onClick={() => setIsAddPhotosModalOpen(true)}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/20 hover:border-amber-400 bg-white/5 hover:bg-white/10 cursor-pointer flex flex-col items-center justify-center p-3 text-center transition group shadow-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 group-hover:scale-110 flex items-center justify-center mb-1.5 transition-transform shadow-sm">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                    Add Photos
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-0.5">to this event</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: FULLSCREEN EXPANDED LIGHTBOX WITH ZOOM & PAN     */}
      {/* ======================================================== */}
      {(viewMode === 'expanded' || !hasMultiplePhotos) && (
        <div className="relative w-full h-full flex flex-col items-center justify-center pt-14 pb-28 sm:pb-32 overflow-hidden">
          {/* Floating Zoom Controls Bar (photos only) */}
          {currentFile && !isVideoMedia(currentFile) && !isAudioMedia(currentFile) && (
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
          )}

          {/* Media Viewport: Native HTML5 Video/Audio Player or Interactive Zoom/Pan Photo */}
          {currentFile && isVideoMedia(currentFile) ? (
            <div className="relative w-full flex-1 flex items-center justify-center px-4 sm:px-14">
              <video
                key={currentFile.viewUrl || currentFile.id}
                src={currentFile.viewUrl}
                poster={getVideoPosterUrl(currentFile)}
                controls
                autoPlay
                playsInline
                preload="metadata"
                style={{ maxHeight: '75vh', maxWidth: '92vw' }}
                className="w-auto h-auto max-w-full max-h-[75vh] rounded-xl shadow-2xl bg-black"
              />
            </div>
          ) : currentFile && isAudioMedia(currentFile) ? (
            <div className="relative w-full flex-1 flex items-center justify-center px-4 sm:px-14">
              <div className="p-6 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md w-full max-w-md space-y-3 text-center">
                <p className="text-sm font-semibold text-white">{item.caption || 'Audio Memory'}</p>
                <audio
                  key={currentFile.viewUrl || currentFile.id}
                  src={currentFile.viewUrl}
                  controls
                  autoPlay
                  className="w-full"
                />
              </div>
            </div>
          ) : (
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
          )}

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
                <div className="truncate flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    {item.caption ? (
                      <p className="text-sm font-semibold truncate">{item.caption}</p>
                    ) : (
                      <p className="text-sm italic text-neutral-400">No caption yet</p>
                    )}
                    {(canDelete || isAdmin || item.owner?.id === user?.id) && item.type === 'single_post' && (
                      <button
                        onClick={() => setIsCaptionSuggestionsOpen(true)}
                        className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1 transition shrink-0 cursor-pointer"
                        title="View AI caption suggestions"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        <span>Suggestions</span>
                      </button>
                    )}
                  </div>
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
                      {isVideoMedia(f) ? (
                        <>
                          {getVideoPosterUrl(f) ? (
                            <img
                              src={getVideoPosterUrl(f)}
                              alt={`Video ${idx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={f.viewUrl ? `${f.viewUrl}#t=0.1` : undefined}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                            <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                          </div>
                        </>
                      ) : (
                        <img
                          src={f.viewUrl || f.thumbUrl}
                          alt={`Thumb ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.dataset.triedFallback && (f.storageKey || f.thumbKey)) {
                              target.dataset.triedFallback = 'true';
                              const fallbackKey = f.thumbKey || f.storageKey || '';
                              target.src = `/api/storage/view?key=${encodeURIComponent(fallbackKey)}`;
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      )}
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
              {hasMultiplePhotos ? 'Delete Memory Options' : 'Delete Memory'}
            </h4>
            <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
              {hasMultiplePhotos
                ? `This memory has ${files.length} photos. What would you like to delete?`
                : 'Choose how you want to remove this memory:'}
            </p>
            <div className="space-y-2">
              {/* Option to delete ONLY current photo if multiple photos */}
              {hasMultiplePhotos && currentFile && onDeleteFile && (
                <button
                  onClick={async () => {
                    if (isDeletingFile) return;
                    setIsDeletingFile(true);
                    const photoToDelete = currentFile;
                    try {
                      await onDeleteFile(item.id, photoToDelete.id);
                      setShowDeleteConfirm(false);
                      resetZoom();
                    } finally {
                      setIsDeletingFile(false);
                    }
                  }}
                  disabled={isDeletingFile}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold text-left transition flex items-center justify-between border border-amber-500/30"
                >
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Delete Photo #{fileIndex + 1} Only</span>
                  </div>
                  <span className="text-[10px] text-amber-400/80 font-normal">
                    {isDeletingFile ? 'Deleting...' : `Keeps other ${files.length - 1} photos`}
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  onDeletePost(item.id, false);
                  onClose();
                }}
                className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-left transition flex items-center justify-between"
              >
                <span>{hasMultiplePhotos ? 'Move Entire Memory to Trash' : 'Move to Trash'}</span>
                <span className="text-[10px] text-neutral-400">Recoverable for 30 days</span>
              </button>

              <button
                onClick={() => {
                  onDeletePost(item.id, true);
                  onClose();
                }}
                className="w-full py-2 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-medium text-left transition flex items-center justify-between border border-rose-500/30"
              >
                <span>{hasMultiplePhotos ? 'Delete Entire Memory Forever' : 'Delete Forever'}</span>
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

      {/* Delete Single Photo confirmation dialog */}
      {deleteTargetPhoto && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="w-full max-w-sm p-5 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl text-white">
            <h4 className="font-semibold text-sm mb-2 text-amber-400 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-amber-400" />
              Delete Photo #{deleteTargetPhoto.index + 1}?
            </h4>
            <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
              Are you sure you want to remove this single photo from this memory? The remaining {files.length - 1} {files.length - 1 === 1 ? 'photo' : 'photos'} will stay safely in your memory.
            </p>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  if (isDeletingFile || !onDeleteFile) return;
                  setIsDeletingFile(true);
                  const targetId = deleteTargetPhoto.id;
                  try {
                    await onDeleteFile(item.id, targetId);
                    setDeleteTargetPhoto(null);
                    resetZoom();
                  } finally {
                    setIsDeletingFile(false);
                  }
                }}
                disabled={isDeletingFile}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold text-center transition shadow-md"
              >
                {isDeletingFile ? 'Deleting Photo...' : `Delete Photo #${deleteTargetPhoto.index + 1}`}
              </button>

              <button
                onClick={() => setDeleteTargetPhoto(null)}
                className="w-full py-2 text-center text-xs text-neutral-400 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Photo Editor Modal: Crop & Rotate */}
      {isEditorOpen && currentFile && (
        <PhotoEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          imageUrl={currentFile.viewUrl || currentFile.thumbUrl}
          imageAlt={item.caption || 'Memory Photo'}
          onSave={handleSaveEditedPhoto}
          onSaveAndShare={handleSaveAndShareEditedPhoto}
          title={`Edit Photo #${fileIndex + 1}`}
        />
      )}

      {/* Add Photos to Album Modal */}
      {isAddPhotosModalOpen && item && (
        <AddPhotosToAlbumModal
          isOpen={isAddPhotosModalOpen}
          onClose={() => setIsAddPhotosModalOpen(false)}
          target={{
            type: 'post',
            postId: item.id,
            albumTitle: item.caption ? item.caption.slice(0, 30) : 'Memory Album',
          }}
          onSuccess={handleAddPhotosSuccess}
        />
      )}

      {/* Viewing Permissions Modal */}
      <ViewingPermissionsModal
        item={item}
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
        groups={groups}
        onPermissionsUpdated={(updatedPlacements, newOverride) => {
          if (onPermissionsUpdated) {
            onPermissionsUpdated(updatedPlacements, newOverride);
          }
        }}
      />

      {/* Caption Suggestions Modal (Review AI suggestions before choosing to apply) */}
      <CaptionSuggestionsModal
        isOpen={isCaptionSuggestionsOpen}
        onClose={() => setIsCaptionSuggestionsOpen(false)}
        item={item}
        onCaptionUpdated={(newCaption) => {
          setCaptionToast('✨ Caption updated successfully!');
          setTimeout(() => setCaptionToast(null), 3000);
          if (onPhotoUpdated && currentFile) {
            onPhotoUpdated(item.id, currentFile);
          }
        }}
      />
    </div>
  );
};
