import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw, Image, Calendar, Users } from 'lucide-react';
import { Group } from '../types/index.ts';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onUploadSuccess: () => void;
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
}

// Client-side resizing (~2048px max dimension) and thumbnail (~400px)
async function resizeImage(file: File): Promise<{ mainBlob: Blob; thumbBlob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const originalWidth = img.width;
      const originalHeight = img.height;

      // 1. Main image: scale down so longest side is max 2048px
      const maxDim = 2048;
      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (targetWidth > maxDim || targetHeight > maxDim) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
          targetWidth = maxDim;
        } else {
          targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
          targetHeight = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context not available'));

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (mainBlob) => {
          if (!mainBlob) return reject(new Error('Failed to compress image'));

          // 2. Thumbnail: scale down so longest side is max 400px
          const thumbDim = 400;
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
          tctx?.drawImage(img, 0, 0, tw, th);

          thumbCanvas.toBlob(
            (thumbBlob) => {
              if (!thumbBlob) return reject(new Error('Failed to generate thumbnail'));
              resolve({
                mainBlob,
                thumbBlob,
                width: targetWidth,
                height: targetHeight,
              });
            },
            'image/jpeg',
            0.75
          );
        },
        'image/jpeg',
        0.88
      );
    };

    img.onerror = () => reject(new Error('Failed to load image file'));
    img.src = url;
  });
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, groups, onUploadSuccess }) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [caption, setCaption] = useState('');
  const [takenAt, setTakenAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dateBasis, setDateBasis] = useState<'taken_at' | 'uploaded_at'>('taken_at');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'pending' as const,
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...newFiles]);
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  // Upload runner: concurrency of 3-4 parallel uploads
  const startUpload = async () => {
    if (queue.length === 0) {
      setGlobalError('Please select at least one photo or file');
      return;
    }

    setIsProcessing(true);
    setGlobalError(null);

    try {
      // 1. Resize all pending image files on client
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
            item.status = 'error';
            item.error = err.message;
            setQueue([...processedQueue]);
            continue;
          }
        }
      }

      // 2. Request signed upload URLs from server
      const fileSpecs = processedQueue
        .filter((q) => q.status !== 'error')
        .map((q) => ({
          fileName: q.file.name,
          fileType: q.file.type.startsWith('video') ? 'video' : q.file.type.startsWith('audio') ? 'audio' : 'photo',
          mimeType: q.file.type || 'image/jpeg',
          fileSize: q.mainBlob?.size || q.file.size,
        }));

      const urlsRes = await fetch('/api/posts/signed-upload-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileSpecs }),
      });

      if (!urlsRes.ok) {
        throw new Error('Failed to retrieve direct upload URLs');
      }

      const { uploads } = await urlsRes.json();

      // 3. Concurrency pool (max 3 at a time) to upload directly to storage adapter
      const readyItems = processedQueue.filter((q) => q.status !== 'error');
      const concurrency = 3;
      let currentIndex = 0;

      async function uploadWorker() {
        while (currentIndex < readyItems.length) {
          const idx = currentIndex++;
          const item = readyItems[idx];
          const uploadSpec = uploads[idx];
          if (!item || !uploadSpec) continue;

          item.status = 'uploading';
          item.mainStorageKey = uploadSpec.mainStorageKey;
          item.thumbStorageKey = uploadSpec.thumbStorageKey;
          setQueue([...processedQueue]);

          try {
            // Upload main
            const mainRes = await fetch(uploadSpec.mainUploadUrl, {
              method: uploadSpec.mainMethod || 'PUT',
              headers: uploadSpec.mainHeaders,
              body: item.mainBlob,
            });

            if (!mainRes.ok) throw new Error('Main file upload failed');

            // Upload thumbnail
            if (item.thumbBlob && uploadSpec.thumbUploadUrl) {
              const thumbRes = await fetch(uploadSpec.thumbUploadUrl, {
                method: uploadSpec.thumbMethod || 'PUT',
                headers: uploadSpec.thumbHeaders,
                body: item.thumbBlob,
              });
              if (!thumbRes.ok) throw new Error('Thumbnail upload failed');
            }

            item.status = 'done';
            item.progress = 100;
            setQueue([...processedQueue]);
          } catch (err: any) {
            item.status = 'error';
            item.error = err.message || 'Upload dropped';
            setQueue([...processedQueue]);
          }
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, readyItems.length) }, () => uploadWorker());
      await Promise.all(workers);

      // Check if all succeeded
      const completedFiles = processedQueue.filter((q) => q.status === 'done');
      if (completedFiles.length === 0) {
        throw new Error('All file uploads failed. Check connection and retry.');
      }

      // 4. Create post record with placements
      const postPayload = {
        caption,
        takenAt: new Date(takenAt).toISOString(),
        uploadedAt: new Date().toISOString(),
        dateBasis,
        groupIds: selectedGroupIds,
        files: completedFiles.map((f, pos) => ({
          storageKey: f.mainStorageKey,
          thumbKey: f.thumbStorageKey,
          fileType: f.file.type.startsWith('video') ? 'video' : f.file.type.startsWith('audio') ? 'audio' : 'photo',
          mimeType: f.file.type || 'image/jpeg',
          fileSize: f.mainBlob?.size || f.file.size,
          width: f.width,
          height: f.height,
          position: pos,
        })),
      };

      const postRes = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });

      if (!postRes.ok) {
        throw new Error('Failed to create post record');
      }

      onUploadSuccess();
      onClose();
    } catch (err: any) {
      setGlobalError(err.message || 'Upload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] playful-card">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Share Memories
            </h3>
            <span className="text-[11px] text-[var(--accent-coral)] font-mono">Zero Quota</span>
          </div>
          <button
            onClick={onClose}
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
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={handleFilesSelected}
            />

            {queue.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--accent-coral)]/60 rounded-2xl flex flex-col items-center justify-center gap-2 transition bg-[var(--bg-surface)]/50"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--accent-coral)]/15 text-[var(--accent-coral)] flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Select Photos, Clips or Audio
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Auto-resizes in browser • No file size limits
                </span>
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Upload Queue ({queue.length} files)
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="text-xs text-[var(--accent-amber)] hover:underline font-medium"
                  >
                    + Add More
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-1 bg-[var(--bg-surface)] rounded-xl">
                  {queue.map((item) => (
                    <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden bg-neutral-900 border border-[var(--border-subtle)] group">
                      <img src={item.previewUrl} alt="Preview" className="w-full h-full object-cover" />

                      {/* Status Overlay */}
                      {item.status === 'resizing' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-amber-400 font-mono">
                          Resizing...
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
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-rose-400">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                      )}

                      {!isProcessing && item.status !== 'done' && (
                        <button
                          type="button"
                          onClick={() => removeQueueItem(item.id)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Date Taken
              </label>
              <input
                type="date"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
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
                <option value="taken_at">Date Taken</option>
                <option value="uploaded_at">Date Uploaded</option>
              </select>
            </div>
          </div>

          {/* Circles / Group Placements */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[var(--accent-coral)]" />
              Share With Circles
            </label>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroupSelection(g.id)}
                    className={`px-3 py-1 text-xs rounded-lg transition font-medium playful-btn ${
                      selected
                        ? 'bg-[var(--accent-coral)] text-white shadow-xs'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Leave unselected to save as a private memory only visible to you.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-end gap-2 bg-[var(--bg-card)]">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={startUpload}
            disabled={isProcessing || queue.length === 0}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md hover:opacity-95 disabled:opacity-50 transition flex items-center gap-1.5 playful-btn"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Upload Memory ({queue.length})</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
