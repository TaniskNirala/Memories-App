import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, Image as ImageIcon, ShieldAlert, AlertTriangle, Clock, Search } from 'lucide-react';
import { apiFetch } from '../context/AuthContext.tsx';
import { EmptyState, Modal, ModalHeader, SearchBox, StatTile, PageHero } from './ui/kit.tsx';
import { relativeTime, shortDate } from '../lib/format.ts';

interface TrashItem {
  id: string;
  caption?: string | null;
  deleted_at: string;
  files?: { thumbUrl?: string; viewUrl?: string }[];
}

export const TrashView: React.FC = () => {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleteProtected, setIsDeleteProtected] = useState(true);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<TrashItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.isDeleteProtected === 'boolean') setIsDeleteProtected(cfg.isDeleteProtected);
      })
      .catch(() => {});
  }, []);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/posts/trash/list');
      if (res.ok) {
        const data = await res.json();
        setTrashItems(data.trash || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRestore = async (postId: string) => {
    setBusyId(postId);
    try {
      const res = await apiFetch(`/api/posts/${postId}/restore`, { method: 'POST' });
      if (res.ok) fetchTrash();
    } catch {
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteForever = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      const res = await apiFetch(`/api/posts/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: true }),
      });
      if (res.ok) {
        setPendingDelete(null);
        fetchTrash();
      }
    } catch {
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trashItems;
    return trashItems.filter((i) => (i.caption || '').toLowerCase().includes(q));
  }, [trashItems, query]);

  const expiringSoon = trashItems.filter((i) => {
    const t = new Date(i.deleted_at).getTime();
    const days = (Date.now() - t) / 86400000;
    return days > 23;
  }).length;

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Safety net"
        title="Deleted, not gone"
        subtitle="Anything you move to trash waits here for 30 days before it disappears for good."
        accent="coral"
        actions={
          <button type="button" onClick={fetchTrash} className="btn btn-soft">
            <RotateCcw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="In trash" value={trashItems.length} hint="recoverable" icon={<Trash2 className="h-4 w-4" />} tone="coral" />
        <StatTile label="Window" value="30d" hint="then auto-purge" icon={<Clock className="h-4 w-4" />} />
        <StatTile label="Expiring" value={expiringSoon} hint="within a week" tone="indigo" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatTile label="Protected" value={isDeleteProtected ? 'Yes' : 'No'} hint="preview lock" tone="mint" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      {isDeleteProtected && (
        <div className="tone-amber flex items-start gap-2.5 rounded-2xl border px-3.5 py-3">
          <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
          <p className="text-[11px] leading-relaxed">
            <strong className="font-bold">Preview protection is on.</strong> Permanent purging is disabled here so live
            memories stay safe. It's fully operational on the Render deployment.
          </p>
        </div>
      )}

      <div className="surface p-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Search deleted memories…" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface flex items-center gap-3 p-3">
              <div className="shimmer h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="shimmer h-2.5 w-1/3 rounded-full" />
                <div className="shimmer h-2 w-1/4 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title={trashItems.length === 0 ? 'Trash is empty' : 'Nothing matches that'}
          body={
            trashItems.length === 0
              ? 'Deleted memories land here first — nothing is removed instantly.'
              : 'Try another word, or clear the search.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(item.deleted_at).getTime()) / 86400000));
            const thumb = item.files?.[0]?.thumbUrl;
            return (
              <div key={item.id} className="surface group flex flex-wrap items-center gap-3 p-3 transition hover:border-[var(--accent-amber)]/35 sm:flex-nowrap sm:p-2.5">
                <div className="shot h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                  {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-surface)] text-[var(--text-muted)]">
                      <ImageIcon className="h-4 w-4 opacity-60" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{item.caption || 'Untitled memory'}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
                    <span>Deleted {relativeTime(item.deleted_at)}</span>
                    <span aria-hidden>·</span>
                    <span className={daysLeft <= 7 ? 'font-semibold text-[var(--tone-rose-fg)]' : ''}>
                      {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                    </span>
                    <span aria-hidden className="hidden sm:inline">·</span>
                    <span className="hidden font-mono sm:inline">{shortDate(item.deleted_at)}</span>
                  </p>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRestore(item.id)}
                    disabled={busyId === item.id}
                    className="btn btn-soft btn-sm"
                  >
                    <RotateCcw className={`h-3 w-3 ${busyId === item.id ? 'animate-spin' : ''}`} /> Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(item)}
                    disabled={isDeleteProtected || busyId === item.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-500/12 hover:text-rose-400 disabled:opacity-40"
                    title={isDeleteProtected ? 'Locked in preview' : 'Delete forever'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} size="sm" label="Delete forever">
        <ModalHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          eyebrow="Final step"
          title="Delete forever?"
          onClose={() => setPendingDelete(null)}
        />
        <div className="space-y-3 p-5">
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            “{pendingDelete?.caption || 'This memory'}” and its files will be removed from storage immediately. There is
            no recovery after this.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(null)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteForever}>
              <Trash2 className="h-3.5 w-3.5" /> Delete forever
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
