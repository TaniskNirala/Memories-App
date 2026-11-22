import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw, Calendar, Users, Sparkles, Crop, Copy, Layers, Images, Play } from 'lucide-react';
import exifr from 'exifr';
import { Group } from '../types/index.ts';
import { apiFetch } from '../context/AuthContext.tsx';
import { PhotoEditorModal, PhotoEditorResult } from './PhotoEditorModal.tsx';
import { fetchStorageCapabilities, uploadFileWithProgress, StorageCapabilitiesResponse } from '../utils/uploadWithProgress.ts';
import { extractVideoThumbnail } from '../utils/videoThumbnail.ts';
import { MB } from '../lib/format.ts';
import { resizeImage, extractPhotoDate } from '../utils/imageProcessing.ts';
import { errMessage } from '../lib/errors.ts';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  selectedGroupId?: string;
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
  hasImagePreview?: boolean;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  groups,
  selectedGroupId,
  onUploadSuccess,
  initialFiles,
}) => {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [caption, setCaption] = useState('');
  const [takenAt, setTakenAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [dateBasis, setDateBasis] = useState<'taken_at' | 'uploaded_at'>('taken_at');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    if (selectedGroupId) return [selectedGroupId];
    return [];
  });
  const [uploadStructure, setUploadStructure] = useState<'grouped' | 'separate'>('grouped');
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingQueueItemId, setEditingQueueItemId] = useState<string | null>(null);
  const [detectedDuplicates, setDetectedDuplicates] = useState<
    Array<{ fileName: string; existingPostId: string; existingCaption: string; existingTakenAt: string; existingThumbUrl: string }>
  >([]);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [captionSuggestions, setCaptionSuggestions] = useState<Array<{ tone: string; text: string }>>([]);
  const [captionTags, setCaptionTags] = useState<string[]>([]);
  const [userTypedCaption, setUserTypedCaption] = useState<string | null>(null);
  const [captionTemporalSummary, setCaptionTemporalSummary] = useState<string | null>(null);
  const [storageCaps, setStorageCaps] = useState<StorageCapabilitiesResponse | null>(null);

  // Sync group selection and fetch active storage capabilities on open
  useEffect(() => {
    if (isOpen) {
      if (selectedGroupId) {
        setSelectedGroupIds([selectedGroupId]);
      } else {
        setSelectedGroupIds([]);
      }
      fetchStorageCapabilities().then((caps) => {
        if (caps) setStorageCaps(caps);
      });
    }
  }, [isOpen, selectedGroupId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const resetForm = () => {
    // Revoke object URLs to avoid memory leaks
    queue.forEach((item) => {
      if (item.previewUrl) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // revoking a blob URL can only fail if it is already revoked
        }
      }
    });
    setQueue([]);
    setCaption('');
    setTakenAt(new Date().toISOString().slice(0, 10));
    setMetadataSource(null);
    setDateBasis('taken_at');
    setSelectedGroupIds(selectedGroupId ? [selectedGroupId] : []);
    setUploadStructure('grouped');
    setGlobalError(null);
    setIsProcessing(false);
    setIsDragOver(false);
    setEditingQueueItemId(null);
    setDetectedDuplicates([]);
    setIsGeneratingCaption(false);
    setCaptionSuggestions([]);
    setCaptionTags([]);
    setUserTypedCaption(null);
    setCaptionTemporalSummary(null);
    dragCounterRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSkipDuplicates = () => {
    const duplicateFileNames = new Set(detectedDuplicates.map((d) => d.fileName));
    setQueue((prev) => prev.filter((item) => !duplicateFileNames.has(item.file.name)));
    setDetectedDuplicates([]);
  };

  const checkDuplicates = async (files: File[]) => {
    try {
      const payload = await Promise.all(
        files.map(async (f) => {
          let checksum = '';
          try {
            const slice = f.slice(0, 4 * MB);
            const buf = await slice.arrayBuffer();
            const hashBuf = await crypto.subtle.digest('SHA-256', buf);
            checksum = Array.from(new Uint8Array(hashBuf))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
          } catch (err) {
            console.error('Checksum calculation failed', err);
          }
          return { name: f.name, size: f.size, checksum };
        })
      );

      const res = await apiFetch('/api/posts/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.duplicates && data.duplicates.length > 0) {
          setDetectedDuplicates(data.duplicates);
        }
      }
    } catch (e) {
      console.error('Check duplicates error:', e);
    }
  };

  const handleAutoGenerateCaption = async () => {
    const firstImage = queue.find((q) => q.file.type.startsWith('image/'));
    if (!firstImage) return;

    setIsGeneratingCaption(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string) || '';
          const targetGroup = groups.find((g) => selectedGroupIds.includes(g.id));
          const res = await apiFetch('/api/ai/generate-caption', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              tone: 'warm',
              context: caption || undefined,
              takenAt: takenAt || undefined,
              groupName: targetGroup?.name || undefined,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.caption) {
              // If user hasn't typed a caption, keep AI caption as initial default
              if (!caption.trim()) {
                setCaption(data.caption);
              } else {
                // Keep manual caption intact, save for restoring
                setUserTypedCaption(caption);
              }
              setCaptionSuggestions(data.suggestions || []);
              setCaptionTags(data.tags || []);
              if (data.temporalSummary) {
                setCaptionTemporalSummary(data.temporalSummary);
              }
            }
          }
        } catch (err) {
          console.error('Failed to auto-generate caption:', err);
        } finally {
          setIsGeneratingCaption(false);
        }
      };
      reader.onerror = () => setIsGeneratingCaption(false);
      reader.readAsDataURL(firstImage.file);
    } catch (err) {
      console.error('Auto caption error:', err);
      setIsGeneratingCaption(false);
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
    const mediaFiles = filesArray.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')
    );
    if (mediaFiles.length === 0) return;

    let validFiles = mediaFiles;
    if (storageCaps && storageCaps.maxFileSizeBytes > 0) {
      const oversized = mediaFiles.filter((f) => f.size > storageCaps.maxFileSizeBytes);
      if (oversized.length > 0) {
        validFiles = mediaFiles.filter((f) => f.size <= storageCaps.maxFileSizeBytes);
        setGlobalError(
          `${oversized.length} file(s) skipped because they exceed the current ${storageCaps.maxFileSizeLabel} upload limit (${oversized[0].name}).`
        );
      }
    }
    if (validFiles.length === 0) return;

    const newFiles: QueuedFile[] = validFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'pending' as const,
      progress: 0,
      hasImagePreview: f.type.startsWith('image/'),
    }));

    setQueue((prev) => [...prev, ...newFiles]);

    // Extract real JPEG poster frames for any selected videos in background
    for (const qItem of newFiles) {
      if (qItem.file.type.startsWith('video/')) {
        extractVideoThumbnail(qItem.file).then((thumb) => {
          if (!thumb) return;
          setQueue((prev) =>
            prev.map((item) =>
              item.id === qItem.id
                ? {
                    ...item,
                    previewUrl: thumb.previewUrl,
                    thumbBlob: thumb.thumbBlob,
                    width: thumb.width,
                    height: thumb.height,
                    hasImagePreview: true,
                  }
                : item
            )
          );
        });
      }
    }

    // Check for duplicate photos in the selected files
    checkDuplicates(validFiles);

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

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing && !editingQueueItemId) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isProcessing, editingQueueItemId]);

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
            } else if (item.file.type.startsWith('video/')) {
              item.mainBlob = item.file;
              if (!item.thumbBlob) {
                const extracted = await extractVideoThumbnail(item.file);
                if (extracted) {
                  item.thumbBlob = extracted.thumbBlob;
                  item.width = extracted.width;
                  item.height = extracted.height;
                }
              }
            } else {
              item.mainBlob = item.file;
              item.thumbBlob = undefined;
            }
          } catch (err) {
            item.mainBlob = item.file;
            if (!item.file.type.startsWith('image/')) {
              item.thumbBlob = undefined;
            }
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
          item.progress = 1;
          setQueue([...processedQueue]);

          try {
            const payloadBlob = item.mainBlob || item.file;
            if (storageCaps && storageCaps.maxFileSizeBytes > 0 && payloadBlob.size > storageCaps.maxFileSizeBytes) {
              throw new Error(`Exceeds ${storageCaps.maxFileSizeLabel} limit`);
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
                item.progress = pct;
                setQueue([...processedQueue]);
              },
            });

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
          } catch (err) {
            console.error('File upload error for', item.file.name, err);
            item.status = 'error';
            item.error = errMessage(err) || 'Upload dropped';
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

      // 3. Create post record(s) with placements
      const defaultDate = (takenAt && !isNaN(new Date(takenAt).getTime())) ? new Date(takenAt).toISOString() : new Date().toISOString();

      if (uploadStructure === 'separate' && completedFiles.length > 1) {
        for (let i = 0; i < completedFiles.length; i++) {
          const fileItem = completedFiles[i];
          const queueItem = processedQueue[i];
          const fileDate = queueItem?.detectedDate && !isNaN(new Date(queueItem.detectedDate).getTime())
            ? new Date(queueItem.detectedDate).toISOString()
            : defaultDate;
          const fileCaption = caption ? `${caption} (${i + 1}/${completedFiles.length})` : '';

          const postPayload = {
            caption: fileCaption || null,
            takenAt: fileDate,
            uploadedAt: new Date().toISOString(),
            dateBasis,
            groupIds: selectedGroupIds,
            files: [{ ...fileItem, position: 0 }],
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
        }
      } else {
        const postPayload = {
          caption,
          takenAt: defaultDate,
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
      }

      resetForm();
      onUploadSuccess();
      onClose();
    } catch (err) {
      setGlobalError(errMessage(err) || 'Upload failed');
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !editingQueueItemId) {
          handleClose();
        }
      }}
      className="scrim z-50"
    >
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[90vh]"
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
            <p className="text-xs text-[var(--text-secondary)]">Files will be added to your current memory upload queue</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Share Memories
            </h3>
            <span className="text-[11px] text-[var(--accent-coral)] font-mono">
              {storageCaps ? `Up to ${storageCaps.maxFileSizeLabel}` : 'Zero Quota'}
            </span>
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

          {/* Duplicate Detection Warning Banner */}
          {detectedDuplicates.length > 0 && (
            <div className="tone-amber p-3.5 rounded-2xl border text-xs space-y-2 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-[var(--tone-amber-fg)]">
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>{detectedDuplicates.length} Duplicate Photo(s) Detected</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetectedDuplicates([])}
                    className="px-2.5 py-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-[11px] hover:bg-[var(--bg-surface-elevated)] transition cursor-pointer"
                    title="Keep all photos in the upload queue and upload anyway"
                  >
                    Keep Both
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipDuplicates}
                    className="px-2.5 py-1 rounded-xl bg-amber-500 text-neutral-950 font-bold text-[11px] hover:bg-amber-400 transition shadow-xs cursor-pointer"
                  >
                    Skip Duplicates
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                We detected photos in your upload queue that already exist in your memories. You can skip them with one click or keep both copies.
              </p>
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
                    {storageCaps
                      ? `Original quality preserved • Up to ${storageCaps.maxFileSizeLabel} per file • Auto-detects EXIF date`
                      : 'Ultra-HD 4K clarity preserved • Auto-detects date taken from EXIF'}
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
                    <span className="tone-amber text-[10px] px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1 border">
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
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      )}

                      {item.file.type.startsWith('video/') && (
                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold uppercase tracking-wider flex items-center gap-0.5 z-10">
                          <Play className="w-2.5 h-2.5 fill-current text-amber-400" />
                          <span>Video</span>
                        </div>
                      )}

                      {/* Duplicate Badge */}
                      {detectedDuplicates.some((d) => d.fileName === item.file.name) && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold text-[9px] uppercase tracking-wider flex items-center gap-0.5 z-10 shadow-xs">
                          <Copy className="w-2.5 h-2.5" />
                          <span>Duplicate</span>
                        </div>
                      )}

                      {/* Status Badges */}
                      {item.status === 'resizing' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[10px]">
                          <span className="animate-pulse">Optimizing...</span>
                        </div>
                      )}
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-1 px-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                          <span className="text-[10px] font-mono font-bold text-sky-300">
                            {Math.max(1, Math.min(99, item.progress))}%
                          </span>
                          <div className="w-full h-1 rounded-full bg-white/15 overflow-hidden">
                            <div
                              className="h-full bg-sky-400 transition-all duration-150"
                              style={{ width: `${Math.max(4, Math.min(100, item.progress))}%` }}
                            />
                          </div>
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
                        <div className="absolute top-1 right-1 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition z-10">
                          {item.file.type.startsWith('image/') && (
                            <button
                              type="button"
                              onClick={() => setEditingQueueItemId(item.id)}
                              className="w-6 h-6 sm:w-5 sm:h-5 bg-black/75 hover:bg-amber-500 hover:text-neutral-950 rounded-full flex items-center justify-center text-white transition shadow-xs"
                              title="Crop & Rotate photo"
                            >
                              <Crop className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeQueueItem(item.id)}
                            className="w-6 h-6 sm:w-5 sm:h-5 bg-black/75 hover:bg-rose-500 rounded-full flex items-center justify-center text-white transition shadow-xs"
                            title="Remove file"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Upload Structure Choice (Grouped Album vs Individual Posts) */}
                {queue.length > 1 && (
                  <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                        Upload Format ({queue.length} photos)
                      </label>
                      <span className="text-[10px] text-[var(--tone-amber-fg)] font-medium">Choose display style</span>
                    </div>
                    <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadStructure('grouped')}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                          uploadStructure === 'grouped'
                            ? 'bg-amber-500/15 border-amber-500/50 text-[var(--text-primary)] ring-1 ring-amber-500/30'
                            : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent-amber)]/40'
                        }`}
                      >
                        <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                          <Layers className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                          <span>Grouped Event Story</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                          1 memory with collage & photo grid
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setUploadStructure('separate')}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                          uploadStructure === 'separate'
                            ? 'bg-amber-500/15 border-amber-500/50 text-[var(--text-primary)] ring-1 ring-amber-500/30'
                            : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent-amber)]/40'
                        }`}
                      >
                        <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--text-primary)]">
                          <Images className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                          <span>Separate Posts</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                          {queue.length} separate posts with individual dates
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Caption
              </label>
              {queue.length > 0 && queue.some((q) => q.file.type.startsWith('image/')) && (
                <button
                  type="button"
                  onClick={handleAutoGenerateCaption}
                  disabled={isGeneratingCaption || isProcessing}
                  className="tone-amber px-2.5 py-1 rounded-lg border hover:opacity-90 transition flex items-center gap-1.5 text-[11px] font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                  title="Auto-generate caption using Gemini AI"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
                  <span>{isGeneratingCaption ? 'Analyzing photo...' : 'Auto-Generate Caption'}</span>
                </button>
              )}
            </div>

            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What made this moment special? Type @friend to mention, or click Auto-Generate..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:ring-2 focus:ring-[var(--ring-focus)] transition"
            />

            {/* Gemini Caption Suggestions Chips */}
            {captionSuggestions.length > 0 && (
              <div className="mt-2 space-y-1.5 p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] animate-in fade-in duration-150">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[var(--tone-amber-fg)] font-bold uppercase tracking-wider block">
                      Time-Aware Suggestions
                    </span>
                    {captionTemporalSummary && (
                      <span className="tone-amber text-[10px] px-2 py-0.5 rounded-full border font-medium">
                        {captionTemporalSummary}
                      </span>
                    )}
                  </div>
                  {userTypedCaption && caption !== userTypedCaption && (
                    <button
                      type="button"
                      onClick={() => setCaption(userTypedCaption)}
                      className="text-[10px] text-[var(--tone-amber-fg)] hover:underline font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      ↩️ Restore my text
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {captionSuggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCaption(s.text)}
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--tone-amber-bg)] border border-[var(--border-subtle)] hover:border-[var(--tone-amber-border)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-left flex items-start gap-2 group cursor-pointer"
                    >
                      <span className="tone-amber text-[9px] uppercase px-1.5 py-0.5 rounded border font-bold shrink-0">
                        {s.tone}
                      </span>
                      <span className="line-clamp-1 group-hover:text-[var(--text-primary)]">{s.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date Selector & Basis */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="tone-amber flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border animate-in fade-in">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>{metadataSource}</span>
              </div>
            )}
          </div>

          {/* Circle Placements */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[var(--accent-amber)]" /> Share to Circles
              </label>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                selectedGroupIds.length === 0
                  ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-color)]'
                  : 'tone-amber'
              }`}>
                {selectedGroupIds.length === 0 ? 'Personal (Only You & Admins)' : `Sharing to ${selectedGroupIds.length} circle(s)`}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mb-2">
              Select which friend circles can see this memory. Leave unselected to keep as a private memory only you can see.
            </p>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  const ev = groups.find((g) => g.isEveryone);
                  if (ev) {
                    setSelectedGroupIds((prev) =>
                      prev.includes(ev.id) ? prev.filter((id) => id !== ev.id) : [...prev, ev.id]
                    );
                  }
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] font-medium transition"
              >
                {selectedGroupIds.some((id) => groups.find((g) => g.id === id)?.isEveryone)
                  ? 'Remove "Everyone"'
                  : '+ "Everyone" Circle'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedGroupIds([])}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--tone-amber-fg)] font-medium transition"
              >
                Keep Private (Only Me)
              </button>
            </div>
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
                        ? 'bg-[var(--accent-coral)] text-white shadow-xs font-semibold'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)]'
                    }`}
                  >
                    <span>{g.name}</span>
                    {g.isEveryone && (
                      <span
                        className={`text-[9px] px-1 rounded font-mono ${
                          selected
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--tone-amber-bg)] text-[var(--tone-amber-fg)] border border-[var(--tone-amber-border)]'
                        }`}
                      >
                        ALL
                      </span>
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
