import React from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

interface LockedPlaceholderProps {
  reason?: string;
  ownerUsername?: string;
}

export const LockedPlaceholder: React.FC<LockedPlaceholderProps> = ({ reason, ownerUsername }) => {
  return (
    <div className="w-full rounded-2xl p-6 bg-[var(--bg-surface)]/70 border border-amber-500/30 flex flex-col items-center text-center my-2">
      <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-3">
        <Lock className="w-6 h-6" />
      </div>

      <h4 className="font-display font-bold text-sm text-[var(--text-primary)] mb-1 flex items-center gap-1.5">
        <ShieldAlert className="w-4 h-4 text-amber-500" />
        Protected Memory
      </h4>

      <p className="text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed mb-3">
        {reason || 'This photo was referenced from another private circle and is awaiting permission from the original owner.'}
      </p>

      {ownerUsername && (
        <span className="text-[11px] font-mono text-[var(--accent-coral)] bg-[var(--bg-surface-elevated)] px-2.5 py-1 rounded-lg">
          Owner: @{ownerUsername}
        </span>
      )}
    </div>
  );
};
