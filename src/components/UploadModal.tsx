import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Image,
  Calendar,
  Users,
  Sparkles,
  Clock,
  Crop,
} from 'lucide-react';
import exifr from 'exifr';
import { Group } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { PhotoEditorModal, PhotoEditorResult } from './PhotoEditorModal.tsx';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onUploadSuccess: () => void;
  initialFiles?: File[];
}

interface QueuedFile {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'resizing' | 'uploading' | 'done' | 'error';
  progress: number;
  mainBlob?: Blob;
  thumbBlob?: Blob;
  mainStorageKey?: string;
  thumbStorageKey?: string;
  error?: string;
  width?: number;
  height?: number;
  detectedDate?: string;
}

// Client-side resizing (~2048px max dimension) and thumbnail (~400px) with resilient fallback
async function resizeImage(file: File): Promise<{ mainBlob: Blob; thumbBlob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // If not an image or SVG/GIF, pass through directly
    if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
      return resolve({
        mainBlob: file,
        thumbBlob: file,
        width: 1200,
        height: 800,
      });
    }

    const img = new window.Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };

    img.onload = async () => {
      try {
        const originalWidth = img.naturalWidth || img.width || 800;
        const originalHeight = img.naturalHeight || img.height || 600;

        // 1. High-Fidelity Main Image:
        // If image is within 4096px (Ultra-HD 4K) and under 25MB, preserve the original untouched file
        // to retain maximum crispness, original camera color space, and zero compression loss!
        const maxDim = 4096;
        let mainBlob: Blob = file;
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;

        if (originalWidth > maxDim || originalHeight > maxDim) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
            targetWidth = maxDim;
          } else {
            targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
            targetHeight = maxDim;
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          }

          mainBlob = await new Promise<Blob>((res) => {
            try {
              canvas.toBlob(
                (b) => res(b || file),
                file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                0.95
              );
            } catch {
              res(file);
            }
          });
        }

        // 2. High-DPI Retina Thumbnail: scale to max 960px at 0.88 quality with high smoothing
        const thumbDim = 960;
        let tw = targetWidth;
        let th = targetHeight;
        if (tw > th) {
          th = Math.round((th * thumbDim) / tw);
          tw = thumbDim;
        } else {
          tw = Math.round((tw * thumbDim) / th);
          th = thumbDim;
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

        cleanup();

        const thumbBlob = await new Promise<Blob>((res) => {
          try {
            thumbCanvas.toBlob((b) => res(b || file), 'image/jpeg', 0.88);
          } catch {
            res(file);
          }
        });

        resolve({
          mainBlob: mainBlob || file,
          thumbBlob: thumbBlob || file,
          width: targetWidth,
          height: targetHeight,
        });
      } catch (err) {
        cleanup();
        resolve({
          mainBlob: file,
          thumbBlob: file,
          width: 1200,
          height: 800,
        });
      }
    };

    img.onerror = () => {
      cleanup();
      resolve({
        mainBlob: file,
        thumbBlob: file,
        width: 1200,
        height: 800,
      });
    };

    img.src = url;
  });
}

// Extract capture date from EXIF metadata (or lastModified date)
async function extractPhotoDate(file: File): Promise<string | null> {
  try {
    if (file.type.startsWith('image/')) {
      const data = await exifr.parse(file, [
        'DateTimeOriginal',
        'CreateDate',
        'DateCreated',
        'ModifyDate',
        'OffsetTimeOriginal',
      ]);

      const candidate = data?.DateTimeOriginal || data?.CreateDate || data?.DateCreated || data?.ModifyDate;
      if (candidate instanceof Date && !isNaN(candidate.getTime())) {
        return candidate.toISOString().slice(0, 10);
      }
      if (typeof candidate === 'string') {
        const parsed = new Date(candidate);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
      }
    }
  } catch (e) {
    console.debug('EXIF extraction skipped or unsupported for file', file.name, e);
  }

  // Fallback to file.lastModified timestamp if plausible
  if (file.lastModified && typeof file.lastModified === 'number') {
    try {
      const mod = new Date(file.lastModified);
      if (!isNaN(mod.getTime()) && mod.getTime() > 0) {
        return mod.toISOString().slice(0, 10);
      }
    } catch {}
  }

  return null;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  groups,
  onUploadSuccess,
  initialFiles,
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [caption, setCaption] = useState('');
  const [takenAt, setTakenAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [dateBasis, setDateBasis] = useState<'taken_at' | 'uploaded_at'>('taken_at');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingQueueItemId, setEditingQueueItemId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const resetForm = () => {
    // Revoke object URLs to avoid memory leaks
    queue.forEach((item) => {
      if (item.previewUrl) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {}
      }
    });
    setQueue([]);
    setCaption('');
    setTakenAt(new Date().toISOString().slice(0, 10));
    setMetadataSource(null);
    setDateBasis('taken_at');
    setSelectedGroupIds([]);
    setGlobalError(null);
    setIsProcessing(false);
    setIsDragOver(false);
    setEditingQueueItemId(null);
    dragCounterRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveQueueEditedPhoto = (result: PhotoEditorResult) => {
    if (!editingQueueItemId) return;
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id === editingQueueItemId) {
          return {
            ...item,
            file: new File([result.blob], item.file.name, { type: 'image/jpeg' }),
            previewUrl: result.previewUrl,
            mainBlob: result.blob,
            thumbBlob: result.thumbBlob,
            width: result.width,
            height: result.height,
          };
        }
        return item;
      })
    );
    setEditingQueueItemId(null);
  };

  const processIncomingFiles = async (filesArray: File[]) => {
    const validFiles = filesArray.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')
    );
    if (validFiles.length === 0) return;

    const newFiles: QueuedFile[] = validFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'pending' as const,
      progress: 0,
    }));

    setQueue((prev) => [...prev, ...newFiles]);

    // Inspect files for EXIF DateTimeOriginal / Capture Date
    let detected: string | null = null;
    for (const f of validFiles) {
      const d = await extractPhotoDate(f);
      if (d) {
        detected = d;
        break;
      }
    }

    if (detected) {
      setTakenAt(detected);
      setMetadataSource(`Auto-detected date (${detected}) from photo EXIF metadata`);
    }
  };

  // Process initialFiles when opened via app-wide drop or external trigger
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      processIncomingFiles(initialFiles);
    }
  }, [isOpen, initialFiles]);

  // Reset form whenever modal closes
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

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
      const filesArray = Array.from(e.dataTransfer.files);
      processIncomingFiles(filesArray);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    if (filesArray.length === 0) return;
    processIncomingFiles(filesArray);
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  // Upload runner: direct multipart streaming via /api/posts/upload-file
  const startUpload = async () => {
    if (queue.length === 0) {
      setGlobalError('Please select at least one photo or file');
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);

    try {
      // 1. Process / resize all pending image files on client
      const processedQueue = [...queue];

      for (let i = 0; i < processedQueue.length; i++) {
        const item = processedQueue[i];
        if (item.status === 'pending') {
          item.status = 'resizing';
          setQueue([...processedQueue]);

          try {
            if (item.file.type.startsWith('image/')) {
              const { mainBlob, thumbBlob, width, height } = await resizeImage(item.file);
              item.mainBlob = mainBlob;
              item.thumbBlob = thumbBlob;
              item.width = width;
              item.height = height;
            } else {
              item.mainBlob = item.file;
              item.thumbBlob = item.file;
            }
          } catch (err: any) {
            item.mainBlob = item.file;
            item.thumbBlob = item.file;
          }
        }
      }

      // 2. Direct upload via FormData to /api/posts/upload-file (bypasses CORS PUT and raw stream issues)
      const completedFiles: any[] = [];
      const concurrency = 2;
      let currentIndex = 0;

      async function uploadWorker() {
        while (currentIndex < processedQueue.length) {
          const idx = currentIndex++;
          const item = processedQueue[idx];
          if (!item) continue;

          item.status = 'uploading';
          setQueue([...processedQueue]);

          try {
            const formData = new FormData();
            formData.append('file', item.mainBlob || item.file, item.file.name);
            if (item.thumbBlob) {
              formData.append('thumb', item.thumbBlob, `thumb_${item.file.name}`);
            }
            formData.append('width', String(item.width || 1200));
            formData.append('height', String(item.height || 800));

            const res = await apiFetch('/api/posts/upload-file', {
              method: 'POST',
              body: formData,
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error || `Upload failed (${res.status})`);
            }

            const data = await res.json();
            item.mainStorageKey = data.storageKey;
            item.thumbStorageKey = data.thumbKey;
            item.status = 'done';
            item.progress = 100;
            setQueue([...processedQueue]);

            completedFiles.push({
              storageKey: data.storageKey,
              thumbKey: data.thumbKey,
              fileType: data.fileType || 'photo',
              mimeType: data.mimeType || item.file.type || 'image/jpeg',
              fileSize: data.fileSize || item.file.size,
              width: data.width || item.width || 1200,
              height: data.height || item.height || 800,
              position: idx,
            });
          } catch (err: any) {
            console.error('File upload error for', item.file.name, err);
            item.status = 'error';
            item.error = err.message || 'Upload dropped';
            setQueue([...processedQueue]);
          }
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, processedQueue.length) }, () => uploadWorker());
      await Promise.all(workers);

      // Check if any succeeded
      if (completedFiles.length === 0) {
        const firstErr = processedQueue.find((q) => q.error)?.error;
        throw new Error(firstErr || 'File upload failed. Check connection and retry.');
      }

      // Sort files by position
      completedFiles.sort((a, b) => a.position - b.position);

      // 3. Create post record with placements
      const postPayload = {
        caption,
        takenAt: new Date(takenAt).toISOString(),
        uploadedAt: new Date().toISOString(),
        dateBasis,
        groupIds: selectedGroupIds,
        files: completedFiles,
      };

      const postRes = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });

      if (!postRes.ok) {
        const pErr = await postRes.json().catch(() => ({}));
        throw new Error(pErr.error || 'Failed to create post record');
      }

      resetForm();
      onUploadSuccess();
      onClose();
    } catch (err: any) {
      setGlobalError(err.message || 'Upload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] playful-card"
      >
        {/* Full modal drag-over overlay when user drops more files onto an existing queue */}
        {isDragOver && queue.length > 0 && (
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm border-2 border-dashed border-amber-400 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 mb-3 animate-bounce">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Drop to add photos</h3>
            <p className="text-xs text-neutral-300">Files will be added to your current memory upload queue</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Share Memories
            </h3>
            <span className="text-[11px] text-[var(--accent-coral)] font-mono">Zero Quota</span>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {globalError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          {/* File Picker & Queue */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={handleFilesSelected}
            />

            {queue.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center space-y-3 group ${
                  isDragOver
                    ? 'border-amber-400 bg-amber-500/15 ring-4 ring-amber-400/25 scale-[1.01] shadow-xl shadow-amber-500/10'
                    : 'border-[var(--border-color)] hover:border-amber-400/70 bg-[var(--bg-surface)]/60 hover:bg-[var(--bg-surface)]'
                }`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                    isDragOver
                      ? 'bg-amber-500 text-neutral-950 scale-110 rotate-2 shadow-lg shadow-amber-500/40'
                      : 'bg-[var(--bg-surface-elevated)] text-[var(--accent-coral)] group-hover:scale-105 group-hover:text-amber-400'
                  }`}
                >
                  <Upload className={`w-7 h-7 ${isDragOver ? 'animate-bounce' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {isDragOver ? 'Drop photos or videos right here!' : 'Drag & drop photos here, or browse'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Ultra-HD 4K clarity preserved • Auto-detects date taken from EXIF
                  </p>
                </div>
                <span className="px-3.5 py-1.5 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] group-hover:border-amber-400 transition shadow-xs">
                  Choose from computer
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      Upload Queue ({queue.length} files)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 font-medium flex items-center gap-1 border border-amber-500/20">
                      <Sparkles className="w-2.5 h-2.5" /> 4K Ultra-HD
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="text-[var(--accent-coral)] hover:underline font-semibold"
                  >
                    + Add More
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900 border border-[var(--border-color)] group"
                    >
                      <img
                        src={item.previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />

                      {/* Status Badges */}
                      {item.status === 'resizing' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[10px]">
                          <span className="animate-pulse">Optimizing...</span>
                        </div>
                      )}
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                        </div>
                      )}
                      {item.status === 'done' && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-rose-400 p-1 text-center">
                          <AlertCircle className="w-5 h-5 mb-0.5" />
                          <span className="text-[9px] line-clamp-1">{item.error || 'Failed'}</span>
                        </div>
                      )}

                      {!isProcessing && item.status !== 'done' && (
                        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                          {item.file.type.startsWith('image/') && (
                            <button
                              type="button"
                              onClick={() => setEditingQueueItemId(item.id)}
                              className="w-5 h-5 bg-black/75 hover:bg-amber-500 hover:text-neutral-950 rounded-full flex items-center justify-center text-white transition shadow-xs"
                              title="Crop & Rotate photo"
                            >
                              <Crop className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeQueueItem(item.id)}
                            className="w-5 h-5 bg-black/75 hover:bg-rose-500 rounded-full flex items-center justify-center text-white transition shadow-xs"
                            title="Remove file"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Caption
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What made this moment special? Type @friend to mention..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:ring-2 focus:ring-[var(--ring-focus)] transition"
            />
          </div>

          {/* Date Selector & Basis */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Date Taken
                </label>
                <input
                  type="date"
                  value={takenAt}
                  onChange={(e) => {
                    setTakenAt(e.target.value);
                    setMetadataSource(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Feed Sort Basis
                </label>
                <select
                  value={dateBasis}
                  onChange={(e) => setDateBasis(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                >
                  <option value="taken_at">By Date Taken (Chronological)</option>
                  <option value="uploaded_at">By Date Uploaded (Recent First)</option>
                </select>
              </div>
            </div>

            {/* Detected metadata indicator */}
            {metadataSource && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 animate-in fade-in">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>{metadataSource}</span>
              </div>
            )}
          </div>

          {/* Circle Placements */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Share to Circles
            </label>
            <p className="text-[11px] text-[var(--text-muted)] mb-2">
              Select which friend circles can see this memory. Leave unselected for standalone personal memory.
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
              {groups.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroupSelection(g.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${
                      selected
                        ? 'bg-[var(--accent-coral)] text-white shadow-xs'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]'
                    }`}
                  >
                    <span>{g.name}</span>
                    {g.isEveryone && (
                      <span className="text-[9px] bg-white/20 px-1 rounded">ALL</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-card)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={startUpload}
            disabled={isProcessing || queue.length === 0}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center gap-2 playful-btn shadow-md disabled:opacity-40"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Share Memory</span>
            )}
          </button>
        </div>
      </div>

      {/* Photo Editor for Queued Photo */}
      {editingQueueItemId && (
        <PhotoEditorModal
          isOpen={Boolean(editingQueueItemId)}
          onClose={() => setEditingQueueItemId(null)}
          imageUrl={queue.find((q) => q.id === editingQueueItemId)?.previewUrl || ''}
          imageAlt="Queued Photo"
          onSave={handleSaveQueueEditedPhoto}
          title="Crop & Rotate Photo"
        />
      )}
    </div>
  );
};
