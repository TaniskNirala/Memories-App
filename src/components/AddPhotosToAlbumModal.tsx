import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Images,
  Sparkles,
  Check,
  Play,
} from 'lucide-react';
import exifr from 'exifr';
import { apiFetch } from '../context/AuthContext.tsx';
import {
  fetchStorageCapabilities,
  uploadFileWithProgress,
  StorageCapabilitiesResponse,
} from '../utils/uploadWithProgress.ts';
import { extractVideoThumbnail } from '../utils/videoThumbnail.ts';

interface AddPhotosToAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  target:
    | { type: 'post'; postId: string; albumTitle?: string }
    | { type: 'collection'; collectionId: string; collectionTitle?: string };
  onSuccess: () => void;
}

interface QueuedItem {
  id: string;
  file: File;
  previewUrl: string;
  detectedDate?: string;
  thumbBlob?: Blob;
  hasImagePreview?: boolean;
}

export const AddPhotosToAlbumModal: React.FC<AddPhotosToAlbumModalProps> = ({
  isOpen,
  onClose,
  target,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'library'>('upload');
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [storageCaps, setStorageCaps] = useState<StorageCapabilitiesResponse | null>(null);

  // Library picker state (for curated collections)
  const [libraryPosts, setLibraryPosts] = useState<any[]>([]);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setQueue([]);
      setErrorMessage(null);
      setIsProcessing(false);
      setUploadProgress(0);
      setIsDragOver(false);
      setSelectedPostIds([]);
      setActiveTab('upload');
      fetchStorageCapabilities().then((caps) => {
        if (caps) setStorageCaps(caps);
      });

      if (target.type === 'collection') {
        fetchLibraryPosts();
      }
    } else {
      // Clean up object URLs
      queue.forEach((q) => {
        try {
          URL.revokeObjectURL(q.previewUrl);
        } catch {}
      });
    }
  }, [isOpen]);

  const fetchLibraryPosts = async () => {
    setLoadingLibrary(true);
    try {
      const res = await apiFetch('/api/feed?limit=50&filter=single');
      if (res.ok) {
        const data = await res.json();
        const posts = (data.items || []).filter((item: any) => item.type === 'single_post');
        setLibraryPosts(posts);
      }
    } catch (e) {
      console.error('Failed to load library posts', e);
    } finally {
      setLoadingLibrary(false);
    }
  };

  const processIncomingFiles = async (files: File[]) => {
    const media = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (media.length === 0) return;

    let valid = media;
    if (storageCaps && storageCaps.maxFileSizeBytes > 0) {
      const oversized = media.filter((f) => f.size > storageCaps.maxFileSizeBytes);
      if (oversized.length > 0) {
        valid = media.filter((f) => f.size <= storageCaps.maxFileSizeBytes);
        setErrorMessage(
          `${oversized.length} file(s) skipped because they exceed the current ${storageCaps.maxFileSizeLabel} upload limit (${oversized[0].name}).`
        );
      }
    }
    if (valid.length === 0) return;

    const newItems: QueuedItem[] = valid.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      hasImagePreview: f.type.startsWith('image/'),
    }));

    setQueue((prev) => [...prev, ...newItems]);

    for (const qItem of newItems) {
      if (qItem.file.type.startsWith('video/')) {
        extractVideoThumbnail(qItem.file).then((thumb) => {
          if (!thumb) return;
          setQueue((prev) =>
            prev.map((item) =>
              item.id === qItem.id
                ? { ...item, previewUrl: thumb.previewUrl, thumbBlob: thumb.thumbBlob, hasImagePreview: true }
                : item
            )
          );
        });
      }
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    processIncomingFiles(filesArray);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => {
      const targetItem = prev.find((item) => item.id === id);
      if (targetItem) {
        try {
          URL.revokeObjectURL(targetItem.previewUrl);
        } catch {}
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  // Drag and drop events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processIncomingFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Ultra-HD processing: preserve originals under 4096px, downscale giant images with high quality, extract real JPEG posters for videos
  const prepareBlobs = async (
    file: File,
    existingThumb?: Blob
  ): Promise<{ mainBlob: Blob; thumbBlob?: Blob; width: number; height: number }> => {
    if (file.type.startsWith('video/')) {
      if (existingThumb) {
        return { mainBlob: file, thumbBlob: existingThumb, width: 1280, height: 720 };
      }
      const extracted = await extractVideoThumbnail(file);
      return {
        mainBlob: file,
        thumbBlob: extracted?.thumbBlob,
        width: extracted?.width || 1280,
        height: extracted?.height || 720,
      };
    }

    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
        resolve({ mainBlob: file, thumbBlob: file.type.startsWith('image/') ? file : undefined, width: 1200, height: 800 });
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const naturalWidth = img.naturalWidth || 1200;
        const naturalHeight = img.naturalHeight || 800;

        const maxOriginalDim = 4096;
        const keepOriginal = naturalWidth <= maxOriginalDim && naturalHeight <= maxOriginalDim && file.size < 25 * 1024 * 1024;

        const maxThumbDimension = 960;
        let tw = naturalWidth;
        let th = naturalHeight;
        if (tw > th) {
          th = Math.round((th * maxThumbDimension) / tw);
          tw = maxThumbDimension;
        } else {
          tw = Math.round((tw * maxThumbDimension) / th);
          th = maxThumbDimension;
        }

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext('2d');
        if (tctx) {
          tctx.imageSmoothingEnabled = true;
          tctx.imageSmoothingQuality = 'high';
          tctx.drawImage(img, 0, 0, tw, th);
        }

        thumbCanvas.toBlob(
          (thumbBlob) => {
            if (keepOriginal) {
              resolve({
                mainBlob: file,
                thumbBlob: thumbBlob || file,
                width: naturalWidth,
                height: naturalHeight,
              });
              return;
            }

            const canvas = document.createElement('canvas');
            let w = naturalWidth;
            let h = naturalHeight;
            if (w > h) {
              h = Math.round((h * maxOriginalDim) / w);
              w = maxOriginalDim;
            } else {
              w = Math.round((w * maxOriginalDim) / h);
              h = maxOriginalDim;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, w, h);
            }

            canvas.toBlob(
              (mainBlob) => {
                resolve({
                  mainBlob: mainBlob || file,
                  thumbBlob: thumbBlob || file,
                  width: w,
                  height: h,
                });
              },
              'image/jpeg',
              0.95
            );
          },
          'image/jpeg',
          0.88
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ mainBlob: file, thumbBlob: file, width: 1200, height: 800 });
      };

      img.src = objectUrl;
    });
  };

  const handleUploadNewPhotos = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setUploadProgress(10);

    try {
      // 1. Process and prepare Blobs
      const preparedList: Array<{ mainBlob: Blob; thumbBlob?: Blob; width: number; height: number; file: File }> = [];
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        const res = await prepareBlobs(item.file, item.thumbBlob);
        preparedList.push({ ...res, file: item.file });
        setUploadProgress(10 + Math.round(((i + 1) / queue.length) * 20));
      }

      // 2. Upload blobs via direct multipart upload with live two-phase progress
      const uploadedFilesInfo = [];
      for (let i = 0; i < preparedList.length; i++) {
        const item = preparedList[i];
        const payloadBlob = item.mainBlob || item.file;
        if (storageCaps && storageCaps.maxFileSizeBytes > 0 && payloadBlob.size > storageCaps.maxFileSizeBytes) {
          throw new Error(`"${item.file.name}" exceeds the ${storageCaps.maxFileSizeLabel} limit`);
        }

        const formData = new FormData();
        formData.append('file', payloadBlob, item.file.name);
        if (item.thumbBlob && item.thumbBlob.type.startsWith('image/')) {
          const baseName = item.file.name.replace(/\.[^.]+$/, '');
          formData.append('thumb', item.thumbBlob, `thumb_${baseName}.jpg`);
        }
        formData.append('width', String(item.width || 1200));
        formData.append('height', String(item.height || 800));

        const data = await uploadFileWithProgress(formData, {
          useTwoPhaseSse: storageCaps?.backend === 'telegram',
          onProgress: (pct) => {
            const overall = 20 + Math.round(((i + pct / 100) / preparedList.length) * 70);
            setUploadProgress(Math.min(95, overall));
          },
        });

        uploadedFilesInfo.push({
          storageKey: data.storageKey,
          thumbKey: data.thumbKey || data.storageKey,
          fileType: data.fileType || (item.file.type.startsWith('video/') ? 'video' : 'photo'),
          fileSize: data.fileSize || item.mainBlob.size,
          mimeType: data.mimeType || item.file.type || 'image/jpeg',
          width: data.width || item.width,
          height: data.height || item.height,
        });

        setUploadProgress(20 + Math.round(((i + 1) / preparedList.length) * 70));
      }

      // 4. Register to target
      if (target.type === 'post') {
        // Append files directly to existing post
        const res = await apiFetch(`/api/posts/${target.postId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: uploadedFilesInfo }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add photos to memory post');
        }
      } else {
        // Curated collection: create post associated with albumId
        const res = await apiFetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: '',
            files: uploadedFilesInfo,
            albumId: target.collectionId,
            dateBasis: 'taken_at',
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add photos to collection');
        }
      }

      setUploadProgress(100);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Add photos error:', err);
      setErrorMessage(err.message || 'Failed to upload and add photos');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLinkExistingPhotos = async () => {
    if (selectedPostIds.length === 0 || isProcessing || target.type !== 'collection') return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/albums/${target.collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: selectedPostIds }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to link photos');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to link photos to album');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleSelectPost = (postId: string) => {
    setSelectedPostIds((prev) =>
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  const targetTitle =
    target.type === 'post'
      ? target.albumTitle || 'Pre-uploaded Album'
      : target.collectionTitle || 'Curated Album';

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) {
          onClose();
        }
      }}
      className="scrim z-50"
    >
      <div className="relative w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] flex flex-col max-h-[90vh] overflow-hidden text-[var(--text-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Images className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm sm:text-base text-[var(--text-primary)]">
                Add Photos to Event
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                Adding to: <span className="font-semibold text-[var(--accent-coral)]">{targetTitle}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Collection Tab Switcher (if target is collection) */}
        {target.type === 'collection' && (
          <div className="flex items-center border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-5 pt-2">
            <button
              onClick={() => setActiveTab('upload')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload New Photos</span>
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'library'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Images className="w-3.5 h-3.5" />
              <span>Select from Library ({selectedPostIds.length})</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFilesSelected}
              />

              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center space-y-2 group ${
                  isDragOver
                    ? 'border-amber-400 bg-amber-500/15 ring-4 ring-amber-400/25 scale-[1.01]'
                    : 'border-[var(--border-color)] hover:border-amber-400/70 bg-[var(--bg-surface)]/60 hover:bg-[var(--bg-surface)]'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                    isDragOver
                      ? 'bg-amber-500 text-neutral-950 scale-110 shadow-lg shadow-amber-500/30'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--accent-coral)] group-hover:scale-105'
                  }`}
                >
                  <Upload className={`w-6 h-6 ${isDragOver ? 'animate-bounce' : ''}`} />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                    {isDragOver ? 'Drop photos to add!' : 'Drag & drop photos here, or click to browse'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {storageCaps
                      ? `Original quality preserved • Up to ${storageCaps.maxFileSizeLabel} per file`
                      : 'Ultra-HD 4K quality preserved • Direct addition to this event'}
                  </p>
                </div>
              </div>

              {/* Queue List */}
              {queue.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                      New Photos to Add ({queue.length})
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20 font-medium">
                        <Sparkles className="w-2.5 h-2.5 inline mr-0.5" /> 4K Ultra-HD
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="text-amber-500 hover:underline font-semibold"
                    >
                      + Add More
                    </button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                    {queue.map((item, idx) => (
                      <div
                        key={item.id}
                        className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900 border border-[var(--border-color)] group shadow-xs"
                      >
                        {item.file.type.startsWith('video/') && !item.hasImagePreview ? (
                          <video
                            src={item.previewUrl}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt="Thumbnail"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white flex items-center gap-0.5">
                          {item.file.type.startsWith('video/') && <Play className="w-2.5 h-2.5 fill-current text-amber-400" />}
                          <span>+{idx + 1}</span>
                        </span>
                        {!isProcessing && (
                          <button
                            type="button"
                            onClick={() => removeQueueItem(item.id)}
                            className="absolute top-1 right-1 w-6 h-6 sm:w-5 sm:h-5 bg-black/75 hover:bg-rose-500 rounded-full flex items-center justify-center text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition shadow-xs"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {isProcessing && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono">
                    <span>Optimizing and uploading to event...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--bg-surface-elevated)] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Library Picker Tab (for Collections) */
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Select existing memory posts from your library to include in this collection:
              </p>

              {loadingLibrary ? (
                <div className="py-12 flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                  <span className="text-xs">Loading library memories...</span>
                </div>
              ) : libraryPosts.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  No memory posts found in library.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto p-1">
                  {libraryPosts.map((post) => {
                    const firstFile = post.files?.[0];
                    const isSelected = selectedPostIds.includes(post.id);
                    return (
                      <div
                        key={post.id}
                        onClick={() => toggleSelectPost(post.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition ${
                          isSelected
                            ? 'border-amber-500 ring-2 ring-amber-500/30'
                            : 'border-[var(--border-subtle)] hover:border-amber-400/60'
                        }`}
                      >
                        <img
                          src={firstFile?.thumbUrl || firstFile?.viewUrl}
                          alt={post.caption || 'Memory'}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-amber-500/25 flex items-center justify-center">
                            <div className="w-6 h-6 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center shadow-md">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          </div>
                        )}
                        {post.files?.length > 1 && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white">
                            +{post.files.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[var(--border-color)] flex items-center justify-between gap-3 bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            Cancel
          </button>

          {activeTab === 'upload' ? (
            <button
              type="button"
              onClick={handleUploadNewPhotos}
              disabled={isProcessing || queue.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md disabled:opacity-40"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading to Event...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add {queue.length > 0 ? `${queue.length} Photos` : 'to Event'}</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLinkExistingPhotos}
              disabled={isProcessing || selectedPostIds.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md disabled:opacity-40"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Linking...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Link {selectedPostIds.length} Selected</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
