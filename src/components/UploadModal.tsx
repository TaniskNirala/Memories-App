import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw, Image, Calendar, Users } from 'lucide-react';
import { Group } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';

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
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        }

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
        if (tctx) {
          tctx.drawImage(img, 0, 0, tw, th);
        }

        cleanup();

        // Convert canvases to blobs safely
        const mainPromise = new Promise<Blob>((res) => {
          try {
            canvas.toBlob((b) => res(b || file), 'image/jpeg', 0.88);
          } catch {
            res(file);
          }
        });

        const thumbPromise = new Promise<Blob>((res) => {
          try {
            thumbCanvas.toBlob((b) => res(b || file), 'image/jpeg', 0.75);
          } catch {
            res(file);
          }
        });

        const [mainBlob, thumbBlob] = await Promise.all([mainPromise, thumbPromise]);

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

  // Upload runner: concurrency of parallel uploads
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

      // 2. Request signed upload URLs from server (authenticated)
      const fileSpecs = processedQueue.map((q) => ({
        fileName: q.file.name,
        fileType: q.file.type.startsWith('video') ? 'video' : q.file.type.startsWith('audio') ? 'audio' : 'photo',
        mimeType: q.file.type || 'image/jpeg',
        fileSize: q.mainBlob?.size || q.file.size,
      }));

      const urlsRes = await apiFetch('/api/posts/signed-upload-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileSpecs }),
      });

      if (!urlsRes.ok) {
        const errJson = await urlsRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to retrieve direct upload URLs');
      }

      const { uploads } = await urlsRes.json();
      if (!Array.isArray(uploads) || uploads.length === 0) {
        throw new Error('Server returned empty upload specification');
      }

      // 3. Concurrency pool to upload directly to storage adapter
      const readyItems = processedQueue;
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
              body: item.mainBlob || item.file,
            });

            if (!mainRes.ok) {
              const errTxt = await mainRes.text().catch(() => '');
              throw new Error(`Upload write failed (${mainRes.status}): ${errTxt || 'Server rejected file'}`);
            }

            // Upload thumbnail
            if (item.thumbBlob && uploadSpec.thumbUploadUrl) {
              await fetch(uploadSpec.thumbUploadUrl, {
                method: uploadSpec.thumbMethod || 'PUT',
                headers: uploadSpec.thumbHeaders,
                body: item.thumbBlob,
              }).catch(() => {});
            }

            item.status = 'done';
            item.progress = 100;
            setQueue([...processedQueue]);
          } catch (err: any) {
            console.error('File upload error for item', item.file.name, err);
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
        const firstErr = processedQueue.find((q) => q.error)?.error;
        throw new Error(firstErr || 'All file uploads failed. Check connection and retry.');
      }

      // 4. Create post record with placements (authenticated)
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

      const postRes = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });

      if (!postRes.ok) {
        const pErr = await postRes.json().catch(() => ({}));
        throw new Error(pErr.error || 'Failed to create post record');
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
                className="border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-coral)] rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group bg-[var(--bg-surface)]/50"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-elevated)] flex items-center justify-center text-[var(--accent-coral)] group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Choose photos or videos
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Supports high-res images, zero storage quota restrictions
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Upload Queue ({queue.length} files)
                  </span>
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
                <option value="taken_at">By Date Taken (Chronological)</option>
                <option value="uploaded_at">By Date Uploaded (Recent First)</option>
              </select>
            </div>
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
            onClick={onClose}
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
    </div>
  );
};
