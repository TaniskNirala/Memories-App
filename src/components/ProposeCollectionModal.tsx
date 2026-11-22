import React, { useState } from 'react';
import { X, Layers, Calendar, MapPin, Check } from 'lucide-react';
import { Group } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { errMessage } from '../lib/errors.ts';

interface ProposeCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onCreated: () => void;
}

export const ProposeCollectionModal: React.FC<ProposeCollectionModalProps> = ({
  isOpen,
  onClose,
  groups,
  onCreated,
}) => {
  const { isAdmin } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isEvent, setIsEvent] = useState(true);
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventPlace, setEventPlace] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await apiFetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          isEvent,
          eventDate: isEvent ? eventDate : null,
          eventPlace: isEvent ? eventPlace.trim() : null,
          groupIds: selectedGroupIds,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMsg(data.message);
        setTimeout(() => {
          onCreated();
          onClose();
        }, 1200);
      } else {
        setMsg(data.error || 'Failed to submit proposal');
      }
    } catch (e) {
      setMsg(errMessage(e) || 'Error creating collection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="scrim z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--accent-coral)]" />
            <h4 className="font-display font-bold text-sm text-[var(--text-primary)]">
              {isAdmin ? 'Create Event' : 'Propose Event'}
            </h4>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {msg && (
          <div className="tone-amber p-2.5 mb-3 rounded-xl border text-xs font-medium">
            {msg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summer Cabin Trip 2026"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this gathering about?"
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="radio"
                name="coll_type"
                checked={isEvent}
                onChange={() => setIsEvent(true)}
                className="accent-[var(--accent-coral)]"
              />
              <span>Event (has date & place)</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="radio"
                name="coll_type"
                checked={!isEvent}
                onChange={() => setIsEvent(false)}
                className="accent-[var(--accent-coral)]"
              />
              <span>Album (themed photos)</span>
            </label>
          </div>

          {isEvent && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-amber-500" /> Event Date
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-rose-500" /> Location
                </label>
                <input
                  type="text"
                  value={eventPlace}
                  onChange={(e) => setEventPlace(e.target.value)}
                  placeholder="e.g. Lake Tahoe"
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Select Circles to Share With
            </label>
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => {
                const selected = selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
                      selected
                        ? 'bg-[var(--accent-coral)] text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[var(--text-secondary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm playful-btn"
            >
              {loading ? 'Submitting...' : isAdmin ? 'Create Event' : 'Propose Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
