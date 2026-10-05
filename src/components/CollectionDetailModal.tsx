import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Users, Plus, Check, Trash2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { EventAttendee, EventNote } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { AddPhotosToAlbumModal } from './AddPhotosToAlbumModal.tsx';

interface CollectionDetailModalProps {
  collectionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectPhoto: (postId: string) => void;
}

export const CollectionDetailModal: React.FC<CollectionDetailModalProps> = ({
  collectionId,
  isOpen,
  onClose,
  onSelectPhoto,
}) => {
  const { user, isAdmin } = useAuth();
  const [collection, setCollection] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAddPhotosOpen, setIsAddPhotosOpen] = useState(false);

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
  const [eventDateInput, setEventDateInput] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventPlaceInput, setEventPlaceInput] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  const fetchCollection = async () => {
    if (!collectionId) return;
    try {
      const res = await fetch(`/api/albums/${collectionId}`);
      if (res.ok) {
        const data = await res.json();
        setCollection(data.album);
      }
    } catch (e) {}
  };

  const fetchItems = async (resetOffset: boolean = false) => {
    if (!collectionId) return;
    const currentOffset = resetOffset ? 0 : offset;
    setLoading(true);
    try {
      // 60 at a time per requirement
      const res = await fetch(`/api/albums/${collectionId}/items?limit=60&offset=${currentOffset}`);
      if (res.ok) {
        const data = await res.json();
        if (resetOffset) {
          setItems(data.items);
        } else {
          setItems((prev) => [...prev, ...data.items]);
        }
        setOffset(currentOffset + data.items.length);
        setHasMore(data.hasMore);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    if (!collectionId) return;
    try {
      const res = await fetch(`/api/albums/${collectionId}/attendance`);
      if (res.ok) {
        const data = await res.json();
        setAttendees(data.attendees || []);
      }
    } catch (e) {}
  };

  const fetchNotes = async () => {
    if (!collectionId) return;
    try {
      const res = await fetch(`/api/albums/${collectionId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (e) {}
  };

  const fetchAvailableUsers = async () => {
    try {
      const res = await fetch('/api/groups/available-users');
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
      const res = await fetch(`/api/albums/${collectionId}/attendance`, {
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
      const res = await fetch(`/api/albums/${collectionId}/attendance/${userId}`, {
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
      const res = await fetch(`/api/albums/${collectionId}/notes`, {
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
          eventDate: eventDateInput,
          eventPlace: eventPlaceInput,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCollection((prev: any) => ({
          ...prev,
          isEvent: true,
          eventDate: data.eventDate,
          eventPlace: data.eventPlace,
        }));
        setShowConvertToEvent(false);
        fetchAttendance();
        fetchNotes();
      }
    } catch (err) {
      console.error('Failed to convert album to event:', err);
    } finally {
      setIsConverting(false);
    }
  };

  const isUserAttending = attendees.some((a) => a.userId === user?.id);
  const isHost = collection?.creator.id === user?.id || isAdmin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl flex flex-col max-h-[92vh] h-[90vh] playful-card overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[var(--accent-coral)] uppercase tracking-wider">
                {collection?.isEvent ? 'Event Memory' : 'Photo Album'}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {collection?.itemCount || 0} photos
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
                  <span>Convert Album into an Interactive Event</span>
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
                Transform this album into an event to unlock guest attendee tagging and a shared board for guest notes and memories.
              </p>
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
                  <span>Add Photos to Album</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {items.map((item) => (
                <div
                  key={item.postId}
                  onClick={() => onSelectPhoto(item.postId)}
                  className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900 cursor-pointer group border border-[var(--border-subtle)] hover:border-[var(--accent-coral)] transition"
                >
                  <img
                    src={item.thumbUrl || item.viewUrl}
                    alt={item.caption || 'Album photo'}
                    referrerPolicy="no-referrer"
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

      {/* Add Photos to Album Modal */}
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
    </div>
  );
};
