import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { apiFetch } from '../context/AuthContext.tsx';
import { useFeedback } from './ui/Feedback.tsx';

interface PendingRef {
  placement_id: string;
  item_id: string;
  group_id: string;
  group_name: string;
  requester_username: string;
  requester_display_name: string;
  caption: string;
  thumb_key: string;
}

export const PendingReferencesBanner: React.FC<{ onUpdated: () => void }> = ({ onUpdated }) => {
  const { toast } = useFeedback();
  const [requests, setRequests] = useState<PendingRef[]>([]);

  const fetchRequests = async () => {
    try {
      const res = await apiFetch('/api/placements/pending-references');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Load pending references failed', err);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleDecision = async (placementId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await apiFetch(`/api/placements/pending-references/${placementId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        fetchRequests();
        onUpdated();
      }
    } catch (err) {
      console.error('Decide reference failed', err);
      toast('Could not save your decision. Please try again.', 'error');
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {requests.map((req) => (
        <div
          key={req.placement_id}
          className="fade-in flex flex-col gap-3 rounded-2xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/8 p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-amber)]/35 bg-[var(--accent-amber)]/12 text-[var(--accent-amber)]">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-amber)]">
                Sharing request
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
                <strong className="font-semibold text-[var(--text-primary)]">@{req.requester_username}</strong> wants to
                share your photo into <strong className="font-semibold text-[var(--text-primary)]">{req.group_name}</strong>.
              </p>
              {req.caption && (
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-[var(--text-muted)]">“{req.caption}”</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pl-10 sm:pl-0">
            <button onClick={() => handleDecision(req.placement_id, 'approved')} className="btn btn-primary btn-sm">
              <Check className="h-3.5 w-3.5" /> Allow
            </button>
            <button onClick={() => handleDecision(req.placement_id, 'rejected')} className="btn btn-ghost btn-sm">
              <X className="h-3.5 w-3.5" /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
