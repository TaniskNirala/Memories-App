import React, { useEffect } from 'react';
import { Clock, ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export const PendingApprovalScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();

  // Auto-poll approval status every 4 seconds so the user is immediately admitted when approved
  useEffect(() => {
    const interval = setInterval(() => {
      refreshUser();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 text-center">
      <div className="max-w-md w-full p-8 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl playful-card space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center mx-auto mb-2">
          <Clock className="w-8 h-8" />
        </div>

        <h2 className="font-display font-bold text-xl text-[var(--text-primary)]">
          Account Pending Approval
        </h2>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Hello <strong>{user?.displayName}</strong> (@{user?.username})! Kinfolk is an intimate space strictly for our close circle of friends. An administrator has been notified of your registration.
        </p>

        <div className="p-3 rounded-2xl bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)] text-left space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Zero-Trust Privacy</span>
          </div>
          <p>
            Shared memories, albums, and circle conversations remain completely hidden until your account is approved.
          </p>
        </div>

        <div className="pt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => refreshUser()}
            className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-primary)] transition flex items-center gap-1.5 playful-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Check Status
          </button>

          <button
            onClick={() => logout()}
            className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-rose-400 transition flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
