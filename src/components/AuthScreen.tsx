import React, { useState } from 'react';
import {
  Lock,
  User,
  Key,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Moon,
  Sun,
  Sparkles,
  Users,
  CalendarDays,
  Fingerprint,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

/* ---------------------------------------------------------------------------
   Auth / onboarding screen
   Left: editorial brand story + feature rail.  Right: focused glass form.
   --------------------------------------------------------------------------- */

const HIGHLIGHTS = [
  {
    icon: <CalendarDays className="h-4 w-4" />,
    title: 'A timeline, not a feed',
    body: 'Every photo lands on a real date — swipe back through years in one rail.',
  },
  {
    icon: <Users className="h-4 w-4" />,
    title: 'Circles decide reach',
    body: 'Share with Everyone, a trip group, or just one friend. Nothing leaks sideways.',
  },
  {
    icon: <Fingerprint className="h-4 w-4" />,
    title: 'Private by default',
    body: 'No algorithms, no ads, no public profiles. Approval-only membership.',
  },
];

export const AuthScreen: React.FC = () => {
  const { login, register } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const initialResetToken = (() => {
    try {
      const m =
        /(?:^#|&)token=([A-Za-z0-9]+)/.exec(window.location.hash) ||
        /[?&]token=([A-Za-z0-9]+)/.exec(window.location.search);
      return m ? m[1] : '';
    } catch {
      return '';
    }
  })();

  const [mode, setMode] = useState<'login' | 'register' | 'redeem_reset'>(
    initialResetToken ? 'redeem_reset' : 'login'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await login(username, password);
        if (!res.success) setError(res.error || 'Login failed');
      } else if (mode === 'register') {
        const res = await register(username, password, displayName);
        if (!res.success) setError(res.error || 'Registration failed');
      } else {
        const res = await fetch('/api/auth/redeem-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken.trim(), newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccessMsg(data.message || 'Password reset. You can sign in now.');
          setMode('login');
          if (initialResetToken) window.history.replaceState(null, '', '/');
        } else {
          setError(data.error || 'That reset link is not valid');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: typeof mode; label: string }[] = [
    { id: 'login', label: 'Sign in' },
    { id: 'register', label: 'Create account' },
    { id: 'redeem_reset', label: 'Reset link' },
  ];

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row">
      {/* theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className="btn-icon absolute right-4 top-4 z-20 !h-9 !w-9"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="h-4 w-4 text-[var(--accent-amber)]" /> : <Moon className="h-4 w-4 text-[var(--accent-indigo)]" />}
      </button>

      {/* ---------------------------------------------------------- brand side */}
      <section className="relative flex flex-col justify-between overflow-hidden px-6 pb-8 pt-9 sm:px-10 lg:w-[54%] lg:px-14 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(720px 460px at 8% -10%, color-mix(in oklab, var(--accent-amber) 22%, transparent), transparent 68%), radial-gradient(620px 420px at 96% 106%, color-mix(in oklab, var(--accent-coral) 18%, transparent), transparent 70%)',
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-card)]">
              <span aria-hidden className="absolute inset-0 rounded-[14px] opacity-85" style={{ background: 'var(--gradient-ember)' }} />
              <img src="/icon.svg" alt="" className="relative z-10 h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-xl leading-none">Nest</p>
              <p className="eyebrow mt-1 text-[9px]">a private memory timeline</p>
            </div>
          </div>

          <h1 className="mt-9 max-w-xl font-display text-[2.1rem] leading-[1.08] tracking-tight sm:text-[2.7rem]">
            Your photos,
            <br />
            <span className="glow-text">in the order life happened.</span>
          </h1>

          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Nest is a zero-quota memory space for a handful of close friends. Upload originals, sort them by the
            day they were taken, and choose exactly which circle sees what.
          </p>

          <div className="mt-8 grid max-w-xl gap-2.5 sm:grid-cols-3">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/55 p-3 backdrop-blur-md"
              >
                <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--accent-amber)]">
                  {h.icon}
                </span>
                <p className="text-[11.5px] font-bold leading-tight">{h.title}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">{h.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* decorative timeline strip */}
        <div className="relative mt-10 hidden max-w-lg lg:block" aria-hidden>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px flex-1 bg-[var(--border-color)]" />
            <span className="eyebrow">since 2021</span>
            <span className="h-px flex-1 bg-[var(--border-color)]" />
          </div>
          <div className="flex items-end justify-between gap-2">
            {[38, 54, 30, 66, 46, 72, 40, 58].map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-lg border border-[var(--border-subtle)]"
                  style={{
                    height: h,
                    background:
                      i % 3 === 0
                        ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent-amber) 40%, transparent), transparent)'
                        : i % 3 === 1
                          ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent-coral) 34%, transparent), transparent)'
                          : 'linear-gradient(180deg, color-mix(in oklab, var(--accent-cyan) 30%, transparent), transparent)',
                  }}
                />
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- form side */}
      <section className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="surface card-glow overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-5 pt-5 pb-4">
              <p className="eyebrow">
                {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join the circle' : 'Reset access'}
              </p>
              <h2 className="mt-1 font-display text-[1.35rem] leading-tight">
                {mode === 'login'
                  ? 'Pick up where you left off'
                  : mode === 'register'
                    ? 'Request your seat'
                    : 'Set a new password'}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                {mode === 'login'
                  ? 'Your session stays on this device until you sign out.'
                  : mode === 'register'
                    ? 'New accounts are reviewed by an admin before any memory is visible.'
                    : 'Paste the one-time token an admin shared with you.'}
              </p>
            </div>

            {/* tabs */}
            <div className="px-5 pt-4">
              <div className="flex gap-1 rounded-xl bg-[var(--bg-surface)] p-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMode(t.id);
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${
                      mode === t.id
                        ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.6)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 px-5 pb-5 pt-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[11px] font-medium text-rose-300">
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {successMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-medium text-emerald-300">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="label" htmlFor="display-name">
                    Display name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      id="display-name"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Maya Lin"
                      className="field pl-9"
                    />
                  </div>
                </div>
              )}

              {mode !== 'redeem_reset' ? (
                <>
                  <div>
                    <label className="label" htmlFor="username">
                      Username
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        id="username"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="maya"
                        className="field pl-9"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="password">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        id="password"
                        type="password"
                        required
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'login' ? 'Your password' : 'At least 10 characters'}
                        className="field pl-9"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="reset-token">
                      One-time reset token
                    </label>
                    <div className="relative">
                      <Key className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        id="reset-token"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Paste the token"
                        className="field pl-9 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="new-password">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        id="new-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 10 characters"
                        className="field pl-9"
                      />
                    </div>
                  </div>
                </>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary btn-block !mt-4 !py-3">
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black/80" />
                    Working…
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Request access' : 'Save password'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-[var(--text-muted)]">
                <Sparkles className="h-3 w-3 text-[var(--accent-amber)]" />
                End-to-end private · zero quota · no ads
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};
