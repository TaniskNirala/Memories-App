import React, { useState } from 'react';
import { X, Share2, Users, Check, AlertCircle } from 'lucide-react';
import { FeedItem, Group } from '../types/index.ts';
import { apiFetch } from '../context/AuthContext.tsx';

interface SharePlacementModalProps {
  item: FeedItem | null;
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onShareComplete: () => void;
}

export const SharePlacementModal: React.FC<SharePlacementModalProps> = ({
  item,
  isOpen,
  onClose,
  groups,
  onShareComplete,
}) => {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleShare = async () => {
    if (selectedGroupIds.length === 0) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/placements/bunch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: [item.id],
          itemType: item.type === 'single_post' ? 'post' : 'album',
          groupIds: selectedGroupIds,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        setTimeout(() => {
          onShareComplete();
          onClose();
        }, 1200);
      } else {
        setMessage(data.error || 'Failed to share');
      }
    } catch (e: any) {
      setMessage(e.message || 'Share request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl p-5 playful-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-sky-400" />
            <h4 className="font-display font-bold text-sm text-[var(--text-primary)]">
              Share to Circle
            </h4>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
          Place this memory into additional friend circles without duplicating files. If you are referencing another friend's photo, they will be asked to approve it.
        </p>

        {message && (
          <div className="p-2.5 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Group checklist */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4 p-1 bg-[var(--bg-surface)] rounded-xl">
          {groups.map((g) => {
            const isSelected = selectedGroupIds.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleGroup(g.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition ${
                  isSelected
                    ? 'bg-[var(--accent-coral)] text-white font-medium'
                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-color)]'
                }`}
              >
                <span>{g.name}</span>
                {isSelected && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--text-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={loading || selectedGroupIds.length === 0}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm disabled:opacity-40 playful-btn"
          >
            {loading ? 'Sharing...' : `Share (${selectedGroupIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};
