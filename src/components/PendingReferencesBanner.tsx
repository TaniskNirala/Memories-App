import React, { useState, useEffect } from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { apiFetch } from '../context/AuthContext.tsx';

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
  const [requests, setRequests] = useState<PendingRef[]>([]);

  const fetchRequests = async () => {
    try {
      const res = await apiFetch('/api/placements/pending-references');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (e) {}
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
    } catch (e) {}
  };

  if (requests.length === 0) return null;

  return (
    <div className="w-full mb-4 space-y-2">
      {requests.map((req) => (
        <div
          key={req.placement_id}
          className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-xs playful-card animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="font-bold text-[var(--text-primary)] block">
                Sharing Permission Request
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                @{req.requester_username} wants to share your photo into "<strong>{req.group_name}</strong>".
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleDecision(req.placement_id, 'approved')}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 transition"
            >
              <Check className="w-3.5 h-3.5" /> Allow
            </button>
            <button
              onClick={() => handleDecision(req.placement_id, 'rejected')}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-rose-900/40 text-rose-400 font-semibold flex items-center gap-1 transition"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
