import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Users, Plus, Check, Trash2, Eye, EyeOff, Sparkles, Shield, AlertTriangle } from 'lucide-react';
import { EventAttendee, EventNote, Group, FeedItem } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { AddPhotosToAlbumModal } from './AddPhotosToAlbumModal.tsx';
import { ViewingPermissionsModal } from './ViewingPermissionsModal.tsx';

interface CollectionDetailModalProps {
  collectionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: (postId: string, initialIndex?: number) => void;
  onUpdated?: () => void;
  groups?: Group[];
  onDeleteAlbum?: (albumId: string, permanent?: boolean) => Promise<void>;
}

export const CollectionDetailModal: React.FC<CollectionDetailModalProps> = ({
  collectionId,
  isOpen,
  onClose,
  onSelectPhoto,
  onUpdated,
  groups = [],
  onDeleteAlbum,
}) => {
  const { user, isAdmin } = useAuth();
  const [collection, setCollection] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAddPhotosOpen, setIsAddPhotosOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Attendance
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Notes
  const [notes, setNotes] = useState<EventNote[]>([]);
  const [noteText, setNoteText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Convert to event state
  const [showConvertToEvent, setShowConvertToEvent] = useState(false);
  const [eventTitleInput, setEventTitleInput] = useState('');
  const [eventDateInput, setEventDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventPlaceInput, setEventPlaceInput] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const fetchCollection = async () => {
    if (!collectionId) return;
    try {
      const res = await apiFetch(`/api/albums/${collectionId}`);
      if (res.ok) {
        const data = await res.json();
        setCollection(data.album);
        if (data.album?.title) {
          setEventTitleInput(data.album.title);
        }
        if (data.album?.eventDate) {
          setEventDateInput(data.album.eventDate);
        }
        if (data.album?.eventPlace) {
          setEventPlaceInput(data.album.eventPlace);
        }
      }
    } catch (e) {}
  };

  const fetchItems = async (resetOffset: boolean = false) => {
    if (!collectionId) return;
    const currentOffset = resetOffset ? 0 : offset;
    setLoading(true);
    try {
      // 60 at a time per requirement
      const res = await apiFetch(`/api/albums/${collectionId}/items?limit=60&offset=${currentOffset}`);
      if (res.ok) {
        const data = await res.json();
        if (resetOffset) {
          setItems(data.items || []);
        } else {
          setItems((prev) => [...prev, ...(data.items || [])]);
        }
        setOffset(currentOffset + (data.items?.length || 0));
        setHasMore(Boolean(data.hasMore));
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    if (!collectionId) return;
    try {
      const res = await apiFetch(`/api/albums/${collectionId}/attendance`);
      if (res.ok) {
        const data = await res.json();
        setAttendees(data.attendees || []);
      }
    } catch (e) {}
  };

  const fetchNotes = async () => {
    if (!collectionId) return;
    try {
      const res = await apiFetch(`/api/albums/${collectionId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (e) {}
  };

  const fetchAvailableUsers = async () => {
    try {
      const res = await apiFetch('/api/groups/available-users');
      if (res.ok) {
        const data = await res.json();
        setAvailableUsers(data.users || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen && collectionId) {
      fetchCollection();
      fetchItems(true);
      fetchAttendance();
      fetchNotes();
      fetchAvailableUsers();
    }
  }, [isOpen, collectionId]);

  if (!isOpen || !collectionId) return null;

  const handleMarkPresent = async (targetUserId?: string) => {
    try {
      const res = await apiFetch(`/api/albums/${collectionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });
      if (res.ok) {
        fetchAttendance();
        setShowTagDropdown(false);
      }
    } catch (e) {}
  };

  const handleRemoveAttendance = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/albums/${collectionId}/attendance/${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchAttendance();
      }
    } catch (e) {}
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    try {
      const res = await apiFetch(`/api/albums/${collectionId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: noteText.trim(),
          isAnonymous,
          visibility: 'group',
        }),
      });

      if (res.ok) {
        setNoteText('');
        setIsAnonymous(false);
        fetchNotes();
      }
    } catch (e) {}
  };

  const handleConvertToEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionId) return;
    setIsConverting(true);
    try {
      const res = await apiFetch(`/api/albums/${collectionId}/convert-to-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventTitleInput.trim() || collection?.title,
          eventDate: eventDateInput,
          eventPlace: eventPlaceInput,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCollection((prev: any) => ({
          ...prev,
          title: data.title || prev.title,
          isEvent: true,
          eventDate: data.eventDate,
          eventPlace: data.eventPlace,
        }));
        setShowConvertToEvent(false);
        fetchAttendance();
        fetchNotes();
        if (onUpdated) {
          onUpdated();
        }
      }
    } catch (err) {
      console.error('Failed to convert album to event:', err);
    } finally {
      setIsConverting(false);
    }
  };

  const isUserAttending = attendees.some((a) => a.userId === user?.id);
  const isHost = collection?.creator?.id === user?.id || collection?.creator_id === user?.id || isAdmin;

  const handleDeleteEvent = async (permanent: boolean = false) => {
    if (!collectionId) return;
    setIsDeleting(true);
    try {
      if (onDeleteAlbum) {
        await onDeleteAlbum(collectionId, permanent);
      } else {
        await apiFetch(`/api/albums/${collectionId}${permanent ? '?permanent=true' : ''}`, {
          method: 'DELETE',
        });
      }
      setShowDeleteConfirm(false);
      onClose();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl flex flex-col max-h-[92vh] h-[90vh] playful-card overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[var(--accent-coral)] uppercase tracking-wider">
                Event
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {collection?.itemCount || items.length || 0} photos
              </span>
            </div>
            <h2 className="font-display font-bold text-lg sm:text-xl text-[var(--text-primary)]">
              {collection?.title}
            </h2>
            {collection?.description && (
              <p className="text-xs text-[var(--text-secondary)] mt-1">{collection?.description}</p>
            )}

            {/* Event Location & Date */}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--text-muted)]">
              {collection?.eventDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  {collection.eventDate}
                </span>
              )}
              {collection?.eventPlace && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  {collection.eventPlace}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isHost && (
              <button
                onClick={() => setIsPermissionsOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
                title="Adjust circles & viewing permissions"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Permissions</span>
              </button>
            )}

            {isHost && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
                title="Delete this event"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            {!collection?.isEvent && isHost && (
              <button
                onClick={() => setShowConvertToEvent((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 border border-amber-500/30 text-amber-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
                title="Convert this photo album into an event with guest attendees and notes"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Convert to Event</span>
                <span className="sm:hidden">To Event</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inline Convert to Event Form */}
        {showConvertToEvent && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-500/30 animate-in fade-in duration-150">
            <form onSubmit={handleConvertToEvent} className="max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Upgrade to Interactive Event</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConvertToEvent(false)}
                  className="text-neutral-400 hover:text-white text-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-neutral-300 leading-relaxed">
                Unlock guest attendee tagging and a shared board for guest notes and memories.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Event Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Grandma's 80th Birthday, Summer Camping Trip"
                  value={eventTitleInput}
                  onChange={(e) => setEventTitleInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" /> Event Date
                  </label>
                  <input
                    type="date"
                    value={eventDateInput}
                    onChange={(e) => setEventDateInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" /> Event Location / Place
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Grandma's Garden, Central Park"
                    value={eventPlaceInput}
                    onChange={(e) => setEventPlaceInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-neutral-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConvertToEvent(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isConverting ? 'Converting...' : 'Confirm & Convert to Event'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {/* Attendance Section for Events */}
          {collection?.isEvent && (
            <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-400" />
                  Who Was There ({attendees.length})
                </span>

                <div className="flex items-center gap-2">
                  {!isUserAttending ? (
                    <button
                      onClick={() => handleMarkPresent()}
                      className="px-2.5 py-1 rounded-lg bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 transition flex items-center gap-1 playful-btn"
                    >
                      <Check className="w-3.5 h-3.5" /> I was there
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> You attended
                    </span>
                  )}

                  {/* Host tagging friends */}
                  {isHost && (
                    <div className="relative">
                      <button
                        onClick={() => setShowTagDropdown((prev) => !prev)}
                        className="px-2 py-1 rounded-lg bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] text-xs font-medium hover:bg-[var(--border-color)] transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Tag Friend
                      </button>

                      {showTagDropdown && (
                        <div className="absolute right-0 mt-1 w-48 p-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
                          {availableUsers
                            .filter((u) => !attendees.some((a) => a.userId === u.id))
                            .map((u) => (
                              <button
                                key={u.id}
                                onClick={() => handleMarkPresent(u.id)}
                                className="w-full text-left px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded"
                              >
                                {u.display_name} (@{u.username})
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Attendee chips */}
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((att) => (
                  <div
                    key={att.userId}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                  >
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: att.avatarColor }}
                    >
                      {att.displayName.charAt(0)}
                    </div>
                    <span>{att.displayName}</span>
                    {att.taggedBy && !att.isSelf && (
                      <span className="text-[10px] text-[var(--text-muted)] italic">
                        (tagged)
                      </span>
                    )}
                    {(att.isSelf || isHost) && (
                      <button
                        onClick={() => handleRemoveAttendance(att.userId)}
                        className="text-[var(--text-muted)] hover:text-rose-400 ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lazily Loaded Grid (60 at a time) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--text-secondary)]">Photo Grid</h4>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  ({items.length} of {collection?.itemCount || items.length})
                </span>
              </div>

              {isHost && (
                <button
                  onClick={() => setIsAddPhotosOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Photos to Event</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {items.map((item, idx) => (
                <div
                  key={item.id || `${item.postId}_${idx}`}
                  onClick={() => onSelectPhoto(item.postId, item.filePosition || 0)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900 cursor-pointer group border border-[var(--border-subtle)] hover:border-[var(--accent-coral)] transition"
                >
                  <img
                    src={item.thumbUrl || item.viewUrl}
                    alt={item.caption || 'Event photo'}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      const stage = target.dataset.fallbackStage || '0';
                      const key = item.thumbKey || item.storageKey;
                      if (stage === '0' && key) {
                        target.dataset.fallbackStage = '1';
                        target.src = `/api/storage/view?key=${encodeURIComponent(key)}`;
                      } else if (stage === '1' && key) {
                        target.dataset.fallbackStage = '2';
                        const clean = key.replace(/^[/\\]+/, '').replace(/^uploads[/\\]+/, '');
                        target.src = `/uploads/${clean}`;
                      } else if (stage !== '3') {
                        target.dataset.fallbackStage = '3';
                        target.src =
                          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="%23181829"/><circle cx="200" cy="180" r="30" fill="%23f59e0b" opacity="0.2"/><path d="M180 200 L200 160 L220 200 Z" fill="%23f59e0b" opacity="0.8"/><circle cx="220" cy="160" r="6" fill="%23f43f5e" opacity="0.8"/></svg>';
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  {item.caption && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex items-end">
                      <span className="text-[10px] text-white line-clamp-2 leading-tight">
                        {item.caption}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-4">
                <button
                  onClick={() => fetchItems(false)}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] transition playful-btn"
                >
                  {loading ? 'Loading more...' : 'Load Next 60 Photos'}
                </button>
              </div>
            )}
          </div>

          {/* Event Notes Section: "Notes are short texts shown after the last photo; the author picks each note's visibility and may post anonymously (hidden from friends, visible to admins)." */}
          {collection?.isEvent && (
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <h4 className="text-xs font-bold text-[var(--text-secondary)]">
                Event Notes & Memories ({notes.length})
              </h4>

              {/* Notes List */}
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="p-3 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--text-primary)]">
                          {note.author.displayName}
                        </span>
                        {note.isAnonymous && (
                          <span className="text-[10px] text-amber-400 font-mono flex items-center gap-0.5">
                            <EyeOff className="w-3 h-3" /> Anonymous
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-[var(--text-primary)] leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="space-y-2 pt-2">
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Leave a short memory or inside joke from this event..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="rounded accent-[var(--accent-coral)]"
                    />
                    <span>Post anonymously (hidden from friends, visible to admins)</span>
                  </label>

                  <button
                    type="submit"
                    disabled={!noteText.trim()}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition playful-btn"
                  >
                    Add Note
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Add Photos to Event Modal */}
      {isAddPhotosOpen && collectionId && (
        <AddPhotosToAlbumModal
          isOpen={isAddPhotosOpen}
          onClose={() => setIsAddPhotosOpen(false)}
          target={{
            type: 'collection',
            collectionId,
            collectionTitle: collection?.title,
          }}
          onSuccess={() => {
            fetchItems(true);
            fetchCollection();
          }}
        />
      )}

      {/* Viewing Permissions Modal for Event */}
      {isPermissionsOpen && collection && (
        <ViewingPermissionsModal
          item={{
            type: 'collection_card',
            id: collection.id,
            title: collection.title,
            description: collection.description,
            isEvent: Boolean(collection.isEvent),
            eventDate: collection.eventDate,
            eventPlace: collection.eventPlace,
            sortDate: collection.eventDate || collection.created_at,
            itemCount: items.length,
            mosaicUrls: [],
            creator: {
              id: collection.creator?.id || collection.creator_id || '',
              username: collection.creator?.username || '',
              displayName: collection.creator?.displayName || collection.creator?.username || 'Host',
              avatarColor: collection.creator?.avatarColor || '#f59e0b',
            },
            attendeesCount: attendees.length,
            userAttended: isUserAttending,
            placements: collection.placements || [],
          } as FeedItem}
          isOpen={isPermissionsOpen}
          onClose={() => setIsPermissionsOpen(false)}
          groups={groups}
          onPermissionsUpdated={() => {
            fetchCollection();
            if (onUpdated) onUpdated();
          }}
        />
      )}

      {/* Delete Event Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-rose-500/30 rounded-3xl p-5 text-center shadow-2xl space-y-4 playful-card">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-display font-bold text-base text-[var(--text-primary)]">
                Delete "{collection?.title || 'Event'}"?
              </h4>
              <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                Are you sure you want to delete this event? Memories inside will remain safely in your personal library.
              </p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-secondary)] border border-[var(--border-color)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEvent(true)}
                disabled={isDeleting}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-md transition disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
