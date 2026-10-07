import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Image as ImageIcon, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../context/AuthContext.tsx';

export const TrashView: React.FC = () => {
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleteProtected, setIsDeleteProtected] = useState(true);

  useEffect(() => {
    apiFetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (typeof cfg.isDeleteProtected === 'boolean') {
          setIsDeleteProtected(cfg.isDeleteProtected);
        }
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
    } catch (e) {}
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRestore = async (postId: string) => {
    try {
      const res = await apiFetch(`/api/posts/${postId}/restore`, { method: 'POST' });
      if (res.ok) {
        fetchTrash();
      }
    } catch (e) {}
  };

  const handleDeleteForever = async (postId: string) => {
    if (!confirm('Permanently delete this photo forever? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: true }),
      });
      if (res.ok) {
        fetchTrash();
      }
    } catch (e) {}
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-500" />
          <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">
            Trash Bin
          </h2>
        </div>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          Recoverable for 30 days
        </span>
      </div>

      {isDeleteProtected && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span><strong>Protected Preview:</strong> Permanent purging is locked in this preview to safeguard live memories. Delete is fully operational on Render.</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-xs text-[var(--text-muted)]">Loading trash...</div>
      ) : trashItems.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
          Trash bin is empty. No deleted memories.
        </div>
      ) : (
        <div className="space-y-3">
          {trashItems.map((item) => (
            <div
              key={item.id}
              className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs playful-card"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-muted)]">
                  <ImageIcon className="w-5 h-5 opacity-60" />
                </div>
                <div>
                  <span className="font-bold text-[var(--text-primary)] block line-clamp-1">
                    {item.caption || 'Untitled photo'}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Deleted on {new Date(item.deleted_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRestore(item.id)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-400 font-semibold hover:bg-emerald-600/30 transition flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
