import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FeedItem, SinglePostFeedItem, Group } from '../types/index.ts';
import { Lock, Sparkles, Trash2, Calendar, X, Flag, MapPin, CheckCircle2, RefreshCw, PencilLine, Plus } from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { ViewingPermissionsModal } from './ViewingPermissionsModal.tsx';

import { Modal, ModalHeader, EmptyState } from './ui/kit.tsx';
import { monthYearLabel, shortDate } from '../lib/format.ts';

import { MonthMarker, DayNode } from './timeline/TimelineParts.tsx';
import { MemoryCard } from './timeline/MemoryCard.tsx';
import { EventCard } from './timeline/EventCard.tsx';

import type { OnOpenViewer } from './timeline/types.ts';

interface TimelineFeedProps {
  items: FeedItem[];
  groups: Group[];
  selectedGroupId?: string;
  onOpenViewer: OnOpenViewer;
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (collectionId: string) => void;
  onShareToGroup: (itemId: string, itemType: 'post' | 'album', groupId: string) => Promise<void>;
  onOpenUpload: () => void;
  onDeletePost?: (postId: string, permanent?: boolean) => Promise<void>;
  onDeleteAlbum?: (albumId: string, permanent?: boolean) => Promise<void>;
  onMemoryUpdated?: () => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

export const TimelineFeed: React.FC<TimelineFeedProps> = ({
  items,
  groups,
  selectedGroupId,
  onOpenViewer,
  onOpenComments,
  onOpenCollection,
  onShareToGroup,
  onOpenUpload,
  onDeletePost,
  onDeleteAlbum,
  onMemoryUpdated,
  isFiltered,
  onResetFilters,
}) => {
  const { user } = useAuth();
  const [sharingLoadingId, setSharingLoadingId] = useState<string | null>(null);

  const [deleteConfirmItem, setDeleteConfirmItem] = useState<FeedItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [editItem, setEditItem] = useState<{ id: string; caption: string; takenAt: string } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [reportItem, setReportItem] = useState<FeedItem | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const [convertToEventItem, setConvertToEventItem] = useState<FeedItem | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventPlace, setEventPlace] = useState('');
  const [convertingLoading, setConvertingLoading] = useState(false);
  const [permissionsItem, setPermissionsItem] = useState<FeedItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isDeleteProtected, setIsDeleteProtected] = useState(true);

  useEffect(() => {
    apiFetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.isDeleteProtected === 'boolean') setIsDeleteProtected(cfg.isDeleteProtected);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const dateOf = (item: FeedItem) =>
    item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;

  /* month sections → day clusters inside each month, newest first */
  const sections = useMemo(() => {
    type DayCluster = { key: string; date?: string; items: FeedItem[] };
    const months = new Map<
      string,
      { key: string; label: string; sort: number; items: FeedItem[]; days: Map<string, DayCluster> }
    >();

    for (const item of items) {
      const raw = item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;
      const d = raw ? new Date(raw) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const key = valid ? `${d!.getFullYear()}-${String(d!.getMonth()).padStart(2, '0')}` : 'undated';
      const label = valid ? monthYearLabel(d) : 'Undated memories';
      const sort = valid ? d!.getFullYear() * 12 + d!.getMonth() : -1;
      if (!months.has(key)) months.set(key, { key, label, sort, items: [], days: new Map() });
      const month = months.get(key)!;
      month.items.push(item);

      const dayKey = valid ? d!.toISOString().slice(0, 10) : 'undated';
      if (!month.days.has(dayKey)) month.days.set(dayKey, { key: dayKey, date: valid ? raw : undefined, items: [] });
      month.days.get(dayKey)!.items.push(item);
    }

    return Array.from(months.values())
      .sort((a, b) => b.sort - a.sort)
      .map((m) => ({
        key: m.key,
        label: m.label,
        items: m.items,
        days: Array.from(m.days.values()).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)),
      }));
  }, [items]);

  const handleShareClick = useCallback(async (item: FeedItem, targetGroupId: string) => {
    setSharingLoadingId(item.id);
    try {
      await onShareToGroup(item.id, item.type === 'single_post' ? 'post' : 'album', targetGroupId);
      setToastMessage('Shared with the circle');
    } catch {
      setToastMessage('Could not share to that circle');
    } finally {
      setSharingLoadingId(null);
    }
  }, [onShareToGroup]);

  const executeDelete = async (permanent: boolean) => {
    if (!deleteConfirmItem) return;
    setDeleteLoading(true);
    try {
      if (deleteConfirmItem.type === 'single_post') {
        await onDeletePost?.(deleteConfirmItem.id, permanent);
      } else {
        await onDeleteAlbum?.(deleteConfirmItem.id, permanent);
      }
      setDeleteConfirmItem(null);
      setToastMessage(permanent ? 'Deleted permanently' : 'Moved to trash');
    } finally {
      setDeleteLoading(false);
    }
  };

  const executeEdit = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/api/posts/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: editItem.caption, takenAt: new Date(editItem.takenAt).toISOString() }),
      });
      if (res.ok) {
        setEditItem(null);
        onMemoryUpdated?.();
        setToastMessage('Memory updated');
      }
    } finally {
      setEditLoading(false);
    }
  };

  const executeReport = async () => {
    if (!reportItem || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: reportItem.type === 'single_post' ? 'post' : 'album',
          targetId: reportItem.id,
          reason: reportReason.trim(),
        }),
      });
      if (res.ok) {
        setReportSuccess(true);
        setTimeout(() => {
          setReportItem(null);
          setReportSuccess(false);
          setReportReason('');
        }, 1400);
      }
    } finally {
      setReportLoading(false);
    }
  };

  const handleRemoveFromCircle = useCallback(async (item: FeedItem, groupId: string) => {
    const placement = item.placements?.find((p) => p.groupId === groupId);
    const circleName = placement?.groupName || groups.find((g) => g.id === groupId)?.name || 'circle';
    if (item.placements) item.placements = item.placements.filter((p) => p.groupId !== groupId);

    try {
      let res: Response | undefined;
      if (placement && (placement as any).id) {
        res = await apiFetch(`/api/placements/${(placement as any).id}`, { method: 'DELETE' });
      } else {
        res = await apiFetch('/api/placements/remove-by-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.id,
            itemType: item.type === 'single_post' ? 'post' : 'album',
            groupId,
          }),
        });
      }
      if (res?.ok) {
        setToastMessage(`Removed from “${circleName}”`);
        onMemoryUpdated?.();
      } else {
        const err = await res?.json().catch(() => ({}));
        setToastMessage(err?.error || `Could not remove from “${circleName}”`);
      }
    } catch {
      setToastMessage('Something went wrong removing that circle');
    }
  }, [groups, onMemoryUpdated]);

  const handleOpenEdit = useCallback((item: SinglePostFeedItem) => {
    setEditItem({
      id: item.id,
      caption: item.caption || '',
      takenAt: item.takenAt
        ? new Date(item.takenAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    });
  }, []);

  const openConvert = useCallback((item: FeedItem) => {
    const raw = item.type === 'single_post' ? item.takenAt : item.eventDate || item.sortDate;
    setEventTitle(item.type === 'single_post' ? item.caption || 'Event memory' : item.title);
    setEventDate(raw ? new Date(raw).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEventPlace(item.type === 'collection_card' ? item.eventPlace || '' : '');
    setConvertToEventItem(item);
  }, []);

  const executeConvertToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertToEventItem) return;
    setConvertingLoading(true);
    try {
      const res =
        convertToEventItem.type === 'collection_card'
          ? await apiFetch(`/api/albums/${convertToEventItem.id}/convert-to-event`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: eventTitle.trim() || convertToEventItem.title, eventDate, eventPlace }),
            })
          : await apiFetch(`/api/posts/${convertToEventItem.id}/convert-to-event`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: eventTitle, eventDate, eventPlace }),
            });
      if (res.ok) {
        setConvertToEventItem(null);
        onMemoryUpdated?.();
        setToastMessage('Memory turned into an event');
      }
    } catch {
      setToastMessage('Could not convert this memory');
    } finally {
      setConvertingLoading(false);
    }
  };

  /** "24 Nov 2026" — shown beside each card and in the phone day header */
  const dateLabel = (value?: string) => shortDate(value, { year: true }) || 'Undated';

  return (
    <div className="relative">
      {/* toast */}
      {toastMessage && (
        <div className="fixed inset-x-4 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-[80] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-[11.5px] font-semibold shadow-[var(--shadow-float)] fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--tone-emerald-fg)]" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={<X className="h-6 w-6" />}
            title="Nothing matches those filters"
            body="Try a different person, tag or date window — or clear everything and go back to the full timeline."
            action={
              onResetFilters && (
                <button type="button" onClick={onResetFilters} className="btn btn-primary btn-sm">
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="The timeline starts with you"
            body="Drop in the first photo or clip. Once it lands, it takes its place on the rail with the date it was taken."
            action={
              <button type="button" onClick={onOpenUpload} className="btn btn-primary btn-sm">
                <Plus className="h-3.5 w-3.5" /> Add a memory
              </button>
            }
          />
        )
      ) : (
        <>
          <div className="tl-root">
            <div className="tl-rail" aria-hidden="true" />

            {sections.map((section, sectionIdx) => {
              const people = new Set(
                section.items.map((i) => (i.type === 'single_post' ? i.owner.id : i.creator.id))
              ).size;

              return (
                <section key={section.key} className="tl-section">
                  <MonthMarker label={section.label} count={section.items.length} people={people} />

                  {section.days.map((day, dayIdx) => {
                    const dayCount = day.items.length;
                    return (
                      <div key={day.key} className="tl-day">
                        <div className="tl-day-head">
                          <span className="tl-day-head-pill">
                            <span className="tl-day-weekday">{dateLabel(day.date)}</span>
                            <span className="tl-day-count">
                              {dayCount === 1 ? '1 memory' : `${dayCount} memories`}
                            </span>
                          </span>
                        </div>

                        <div className="tl-day-cards">
                          {day.items.map((item, itemIdx) => {
                            const ownerId = item.type === 'single_post' ? item.owner.id : item.creator.id;
                            const canManage = user?.id === ownerId || user?.role === 'admin';
                            const isPriority = sectionIdx === 0 && dayIdx === 0 && itemIdx < 2;

                            return (
                              <div key={item.id} className="tl-entry">
                                <span className="tl-entry-date" aria-hidden="true">
                                  {dateLabel(day.date)}
                                </span>
                                {item.type === 'single_post' ? (
                                  item.isLockedPlaceholder ? (
                                    <div className="card relative overflow-hidden p-5 text-center">
                                      <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/35 bg-amber-500/12 text-[var(--accent-amber)]">
                                        <Lock className="h-5 w-5" />
                                      </div>
                                      <p className="font-display text-sm">Locked memory</p>
                                      <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--text-muted)]">
                                        {item.lockedReason ||
                                          `${item.owner.displayName} hasn’t approved sharing this into this circle yet.`}
                                      </p>
                                    </div>
                                  ) : (
                                    <MemoryCard
                                      item={item}
                                      groups={groups}
                                      selectedGroupId={selectedGroupId}
                                      priority={isPriority}
                                      onOpenViewer={onOpenViewer}
                                      onOpenComments={onOpenComments}
                                      onOpenCollection={onOpenCollection}
                                      onShare={handleShareClick}
                                      sharing={sharingLoadingId === item.id}
                                      onEdit={handleOpenEdit}
                                      onConvert={openConvert}
                                      onPermissions={setPermissionsItem}
                                      onDelete={setDeleteConfirmItem}
                                      onReport={setReportItem}
                                      onRemoveFromCircle={handleRemoveFromCircle}
                                      isDeleteProtected={isDeleteProtected}
                                    />
                                  )
                                ) : (
                                  <EventCard
                                    item={item}
                                    priority={isPriority}
                                    onOpenCollection={onOpenCollection}
                                    onOpenComments={onOpenComments}
                                    onConvert={openConvert}
                                    onPermissions={setPermissionsItem}
                                    onDelete={setDeleteConfirmItem}
                                    onEditEvent={openConvert}
                                    isDeleteProtected={isDeleteProtected}
                                    canManage={canManage}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <DayNode date={day.date} />
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------ delete */}
      <Modal
        open={Boolean(deleteConfirmItem)}
        onClose={() => !deleteLoading && setDeleteConfirmItem(null)}
        size="sm"
        label="Delete memory"
      >
        <ModalHeader
          icon={<Trash2 className="h-4 w-4" />}
          eyebrow="Remove"
          title={deleteConfirmItem?.type === 'collection_card' ? 'Delete this event?' : 'Delete this memory?'}
          onClose={() => !deleteLoading && setDeleteConfirmItem(null)}
        />
        <div className="space-y-2.5 p-5">
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            “{deleteConfirmItem?.type === 'collection_card' ? deleteConfirmItem.title : deleteConfirmItem?.caption || 'This memory'}”
          </p>

          <button
            type="button"
            onClick={() => executeDelete(false)}
            disabled={deleteLoading}
            className="flex w-full items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-3 text-left transition hover:border-[var(--accent-amber)]/50"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-amber)]" />
            <span>
              <span className="block text-[12px] font-bold">Move to trash</span>
              <span className="block text-[10.5px] text-[var(--text-muted)]">Recoverable for 30 days</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => executeDelete(true)}
            disabled={deleteLoading || isDeleteProtected}
            className="tone-rose flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition hover:opacity-90 disabled:opacity-50"
          >
            <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tone-rose-fg)]" />
            <span>
              <span className="block text-[12px] font-bold text-[var(--tone-rose-fg)]">Delete forever</span>
              <span className="block text-[10.5px] text-[var(--tone-rose-muted)]">
                {isDeleteProtected ? 'Locked in preview' : 'Removes the files immediately'}
              </span>
            </span>
          </button>

          <div className="flex justify-end pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmItem(null)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* -------------------------------------------------------------- edit */}
      <Modal open={Boolean(editItem)} onClose={() => !editLoading && setEditItem(null)} size="sm" label="Edit memory">
        <ModalHeader
          icon={<PencilLine className="h-4 w-4" />}
          eyebrow="Edit"
          title="Date & caption"
          onClose={() => !editLoading && setEditItem(null)}
        />
        <div className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="memory-date">
              Date taken
            </label>
            <input
              id="memory-date"
              type="date"
              value={editItem?.takenAt || ''}
              onChange={(e) => editItem && setEditItem({ ...editItem, takenAt: e.target.value })}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="memory-caption">
              Caption
            </label>
            <textarea
              id="memory-caption"
              rows={3}
              value={editItem?.caption || ''}
              onChange={(e) => editItem && setEditItem({ ...editItem, caption: e.target.value })}
              className="field resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditItem(null)} disabled={editLoading}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={executeEdit} disabled={editLoading}>
              {editLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {editLoading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------ report */}
      <Modal open={Boolean(reportItem)} onClose={() => setReportItem(null)} size="sm" label="Report memory">
        <ModalHeader
          icon={<Flag className="h-4 w-4" />}
          eyebrow="Trust & safety"
          title="Report to admins"
          onClose={() => setReportItem(null)}
        />
        <div className="p-5">
          {reportSuccess ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-[var(--tone-emerald-fg)]" />
              <p className="text-[12px] font-semibold text-[var(--tone-emerald-fg)]">Report submitted. Thank you.</p>
            </div>
          ) : (
            <>
              <label className="label" htmlFor="report-reason">
                What should admins look at?
              </label>
              <textarea
                id="report-reason"
                rows={3}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Inappropriate content, privacy concern, accidental upload…"
                className="field resize-none"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportItem(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={executeReport}
                  disabled={reportLoading || !reportReason.trim()}
                >
                  {reportLoading ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ----------------------------------------------------------- convert */}
      <Modal open={Boolean(convertToEventItem)} onClose={() => setConvertToEventItem(null)} size="md" label="Convert to event">
        <ModalHeader
          icon={<Sparkles className="h-4 w-4" />}
          eyebrow="Elevate"
          title={convertToEventItem?.type === 'collection_card' ? 'Turn collection into event' : 'Turn memory into event'}
          subtitle="Events get attendance, a place and shared guest notes."
          onClose={() => setConvertToEventItem(null)}
        />
        <form onSubmit={executeConvertToEvent} className="space-y-3 p-5">
          <div>
            <label className="label" htmlFor="event-title">
              Event title
            </label>
            <input
              id="event-title"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Sunday lake picnic"
              className="field"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label flex items-center gap-1.5" htmlFor="event-date">
                <Calendar className="h-3 w-3" /> Date
              </label>
              <input
                id="event-date"
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label flex items-center gap-1.5" htmlFor="event-place">
                <MapPin className="h-3 w-3" /> Place
              </label>
              <input
                id="event-place"
                value={eventPlace}
                onChange={(e) => setEventPlace(e.target.value)}
                placeholder="Lakeside park"
                className="field"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConvertToEventItem(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={convertingLoading}>
              <Sparkles className="h-3.5 w-3.5" />
              {convertingLoading ? 'Converting…' : 'Convert to event'}
            </button>
          </div>
        </form>
      </Modal>

      {/* --------------------------------------------------------- permissions */}
      {permissionsItem && (
        <ViewingPermissionsModal
          item={permissionsItem}
          isOpen={Boolean(permissionsItem)}
          onClose={() => setPermissionsItem(null)}
          groups={groups}
          onPermissionsUpdated={() => onMemoryUpdated?.()}
        />
      )}
    </div>
  );
};