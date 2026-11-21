import React, { useEffect, useState } from 'react';
import { Clock, ShieldAlert, LogOut, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Avatar } from './ui/kit.tsx';

const STEPS = [
  { label: 'Account created', done: true },
  { label: 'Admin review', done: false },
  { label: 'Circles unlocked', done: false },
];

export const PendingApprovalScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);

  // Poll so the user is admitted the moment an admin approves
  useEffect(() => {
    const interval = setInterval(() => refreshUser(), 5000);
    return () => clearInterval(interval);
  }, []);

  const check = async () => {
    setChecking(true);
    await refreshUser();
    setTimeout(() => setChecking(false), 600);
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="surface card-glow overflow-hidden">
          <div
            className="relative border-b border-[var(--border-subtle)] px-6 pb-5 pt-6"
            style={{
              background:
                'radial-gradient(420px 200px at 12% -40%, color-mix(in oklab, var(--accent-amber) 22%, transparent), transparent 70%)',
            }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-amber)]">
              <Clock className="h-6 w-6" />
            </span>
            <p className="eyebrow mt-4">Almost there</p>
            <h1 className="mt-1 font-display text-[1.5rem] leading-tight">Waiting on a thumbs-up</h1>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              Nest is invite-only. An admin has been pinged about your request — usually this takes a few minutes.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-3">
              <Avatar name={user?.displayName || user?.username} color={user?.avatarColor} src={user?.avatarUrl} size={38} ring />
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-bold">{user?.displayName}</p>
                <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">@{user?.username}</p>
              </div>
              <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-400">
                Pending
              </span>
            </div>

            {/* progress rail */}
            <div className="space-y-3 px-1">
              {STEPS.map((s, i) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="relative flex flex-col items-center">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                        s.done
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                          : i === 1
                            ? 'border-[var(--accent-amber)]/60 bg-[var(--accent-amber)]/12 text-[var(--accent-amber)]'
                            : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                      }`}
                    >
                      {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="mt-1 h-4 w-px bg-[var(--border-color)]" aria-hidden />
                    )}
                  </span>
                  <span
                    className={`text-[12px] ${
                      s.done ? 'font-semibold text-[var(--text-primary)]' : i === 1 ? 'font-semibold text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {s.label}
                  </span>
                  {i === 1 && (
                    <span className="ml-auto flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-amber)]" />
                      live
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-3 py-2.5">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--accent-amber)]" />
              <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
                Until you're approved, timelines, circles and media stay completely invisible. Nothing you do here is
                visible to anyone else.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={check} disabled={checking} className="btn btn-primary btn-sm flex-1">
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check status'}
              </button>
              <button type="button" onClick={() => logout()} className="btn btn-soft btn-sm">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>

            <p className="text-center text-[9.5px] text-[var(--text-muted)]">
              Locked out? Ask the admin for a <KeyRound className="inline h-2.5 w-2.5" /> one-time reset link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
