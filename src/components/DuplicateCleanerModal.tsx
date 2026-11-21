import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../context/AuthContext.tsx';

interface DuplicateFile {
  fileId: string;
  postId: string;
  caption: string | null;
  takenAt: string;
  uploadedAt: string;
  fileSize: number;
  width: number;
  height: number;
  isOwner: boolean;
  ownerName: string;
  viewUrl: string;
  thumbUrl: string;
  placements: Array<{ id: string; name: string }>;
}

interface DuplicateGroup {
  matchKey: string;
  fileSize: number;
  fileCount: number;
  wastedBytes: number;
  files: DuplicateFile[];
}

interface DuplicateCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDuplicatesResolved?: () => void;
}

export const DuplicateCleanerModal: React.FC<DuplicateCleanerModalProps> = ({
  isOpen,
  onClose,
  onDuplicatesResolved,
}) => {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [mergePlacements, setMergePlacements] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchDuplicates = async () => {
    setLoading(true);
    setToast(null);
    try {
      const res = await apiFetch('/api/posts/duplicates/list');
      if (res.ok) {
        const data = await res.json();
        setDuplicateGroups(data.duplicateGroups || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch duplicates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDuplicates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalWastedBytes = duplicateGroups.reduce((acc, g) => acc + g.wastedBytes, 0);
  const totalDuplicatesCount = duplicateGroups.reduce((acc, g) => acc + (g.fileCount - 1), 0);

  const handleResolveGroup = async (group: DuplicateGroup, keepFileId: string) => {
    setResolvingKey(group.matchKey);
    setToast(null);

    const removeFileIds = group.files
      .filter((f) => f.fileId !== keepFileId)
      .map((f) => f.fileId);

    try {
      const res = await apiFetch('/api/posts/duplicates/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepFileId,
          removeFileIds,
          mergePlacements,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: data.message || 'Duplicates resolved successfully', type: 'success' });
        setDuplicateGroups((prev) => prev.filter((g) => g.matchKey !== group.matchKey));
        if (onDuplicatesResolved) {
          onDuplicatesResolved();
        }
      } else {
        setToast({ message: data.error || 'Failed to resolve duplicates', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Error resolving duplicates', type: 'error' });
    } finally {
      setResolvingKey(null);
    }
  };

  const handleKeepBoth = async (group: DuplicateGroup) => {
    setResolvingKey(group.matchKey);
    setToast(null);

    try {
      const res = await apiFetch('/api/posts/duplicates/keep-both', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchKey: group.matchKey }),
      });

      if (res.ok) {
        setToast({
          message: 'Both images kept! They will remain in your vault and won’t be flagged as duplicates.',
          type: 'success',
        });
        setDuplicateGroups((prev) => prev.filter((g) => g.matchKey !== group.matchKey));
        if (onDuplicatesResolved) {
          onDuplicatesResolved();
        }
      } else {
        setToast({ message: 'Failed to record preference', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Error keeping both images', type: 'error' });
    } finally {
      setResolvingKey(null);
    }
  };

  const handleKeepBothAll = async () => {
    setLoading(true);
    setToast(null);
    try {
      for (const group of duplicateGroups) {
        await apiFetch('/api/posts/duplicates/keep-both', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchKey: group.matchKey }),
        });
      }
      setToast({
        message: 'All selected photos kept in your vault.',
        type: 'success',
      });
      setDuplicateGroups([]);
      if (onDuplicatesResolved) {
        onDuplicatesResolved();
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Error keeping all images', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAll = async () => {
    setLoading(true);
    setToast(null);

    let successCount = 0;
    let totalFreed = 0;

    for (const group of duplicateGroups) {
      // Pick oldest as original to keep
      const sorted = [...group.files].sort(
        (a, b) => new Date(a.takenAt || a.uploadedAt).getTime() - new Date(b.takenAt || b.uploadedAt).getTime()
      );
      const keep = sorted[0];
      const remove = sorted.slice(1).map((f) => f.fileId);

      try {
        const res = await apiFetch('/api/posts/duplicates/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keepFileId: keep.fileId,
            removeFileIds: remove,
            mergePlacements,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          successCount += d.removedCount || 0;
          totalFreed += d.freedBytes || 0;
        }
      } catch {}
    }

    setToast({
      message: `Cleaned ${successCount} duplicate photo(s) across all groups! Reclaimed ${(totalFreed / (1024 * 1024)).toFixed(1)} MB.`,
      type: 'success',
    });
    setDuplicateGroups([]);
    setLoading(false);
    if (onDuplicatesResolved) {
      onDuplicatesResolved();
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="scrim z-60">
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] p-5 text-white relative flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-xs">
              <Copy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                Duplicate Photo Cleaner
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Identify and clean identical photos to keep your memory vault tidy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDuplicates}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition"
              title="Refresh duplicate scan"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Toast */}
        {toast && (
          <div
            className={`mt-3 p-2.5 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
              toast.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Protection Note */}
        <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <span><strong>Protected Preview:</strong> Deleting photos is disabled in this preview to protect your memories. You can safely keep all photos.</span>
        </div>

        {/* Summary Card */}
        <div className="mt-3 p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block tracking-wider">
                Duplicate Sets
              </span>
              <span className="font-display font-bold text-lg text-amber-400">
                {duplicateGroups.length} groups
              </span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block tracking-wider">
                Copies Found
              </span>
              <span className="font-display font-bold text-lg text-rose-400">
                {totalDuplicatesCount} photos
              </span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block tracking-wider">
                Reclaimable
              </span>
              <span className="font-display font-bold text-lg text-emerald-400">
                {formatBytes(totalWastedBytes)}
              </span>
            </div>
          </div>

          {duplicateGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleKeepBothAll}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-white border border-white/10 hover:border-emerald-500/30 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Keep both copies for all detected groups"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Keep Both for All</span>
              </button>

              <button
                onClick={handleResolveAll}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs shadow-md transition flex items-center gap-1.5 playful-btn cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Clean All ({duplicateGroups.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Settings Toggle: Merge Placements */}
        <div className="mt-2.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="mergePlacements"
              checked={mergePlacements}
              onChange={(e) => setMergePlacements(e.target.checked)}
              className="rounded accent-amber-500 cursor-pointer"
            />
            <label htmlFor="mergePlacements" className="text-[var(--text-secondary)] text-[11px] cursor-pointer">
              Merge friend circle permissions so no friends lose access to the kept memory
            </label>
          </div>
          <span className="text-[10px] text-amber-400/90 font-medium">Recommended</span>
        </div>

        {/* Duplicate Groups List */}
        <div className="flex-1 overflow-y-auto my-3 space-y-4 pr-1">
          {loading && duplicateGroups.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-muted)] space-y-2">
              <RefreshCw className="w-7 h-7 animate-spin mx-auto text-amber-400" />
              <p className="text-xs">Scanning memories for duplicate photos...</p>
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-muted)] space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-white text-sm">No duplicate photos detected!</h4>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                Your memory timeline is clean and perfectly organized. When you upload photos, duplicate detection will prevent accidental double-uploads.
              </p>
            </div>
          ) : (
            duplicateGroups.map((group, groupIdx) => {
              // Sort by date: oldest is recommended keeper
              const sortedFiles = [...group.files].sort(
                (a, b) => new Date(a.takenAt || a.uploadedAt).getTime() - new Date(b.takenAt || b.uploadedAt).getTime()
              );
              const original = sortedFiles[0];

              return (
                <div
                  key={group.matchKey}
                  className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                        Group #{groupIdx + 1}
                      </span>
                      <span className="text-[var(--text-secondary)] font-medium">
                        {group.fileCount} Identical Copies
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        ({formatBytes(group.fileSize)} each • saves {formatBytes(group.wastedBytes)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleKeepBoth(group)}
                        disabled={resolvingKey === group.matchKey}
                        className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-white border border-white/10 hover:border-emerald-500/30 text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Keep both copies of this image in your vault"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Keep Both Images</span>
                      </button>

                      <button
                        onClick={() => handleResolveGroup(group, original.fileId)}
                        disabled={resolvingKey === group.matchKey}
                        className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-white/10 hover:border-rose-500/40 text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Keep the oldest version and delete duplicate copy"
                      >
                        {resolvingKey === group.matchKey ? (
                          <span>Resolving...</span>
                        ) : (
                          <>
                            <Trash2 className="w-3 h-3 text-rose-400" />
                            <span>Keep Oldest Only</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Side-by-side comparison cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {sortedFiles.map((file, idx) => {
                      const isOldest = idx === 0;

                      return (
                        <div
                          key={file.fileId}
                          className={`p-2.5 rounded-xl border flex gap-3 transition ${
                            isOldest
                              ? 'bg-emerald-500/10 border-emerald-500/30'
                              : 'bg-black/30 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-black/40">
                            <img
                              src={file.thumbUrl || file.viewUrl}
                              alt={file.caption || 'Duplicate photo'}
                              className="w-full h-full object-cover"
                            />
                            {isOldest && (
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-emerald-500 text-[9px] font-bold text-neutral-950 uppercase tracking-wider">
                                Keep
                              </div>
                            )}
                            {!isOldest && (
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-500 text-[9px] font-bold text-white uppercase tracking-wider">
                                Copy
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between text-[11px]">
                            <div>
                              <p className="font-semibold text-white line-clamp-1">
                                {file.caption || 'Untitled Memory'}
                              </p>
                              <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5">
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>{new Date(file.takenAt).toLocaleDateString()}</span>
                              </div>
                              {file.placements && file.placements.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {file.placements.map((p) => (
                                    <span
                                      key={p.id}
                                      className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] text-[var(--text-secondary)] font-mono"
                                    >
                                      {p.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="pt-2 flex justify-end">
                              <button
                                onClick={() => handleResolveGroup(group, file.fileId)}
                                disabled={resolvingKey === group.matchKey}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition ${
                                  isOldest
                                    ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                    : 'bg-white/10 text-[var(--text-secondary)] hover:bg-white/20'
                                }`}
                              >
                                Keep this version
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-muted)]">
            Deleted duplicate photos are safely archived to Trash
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
