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
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

/* ---------------------------------------------------------------------------
   Auth / onboarding screen

   Layout follows the reference style: one soft floating card on a patterned
   page, split into an illustrated banner (art + promise) and a focused form.
   On phones the banner collapses to a slim header so the form stays above the
   fold. All copy, tabs, validation and endpoints are unchanged.
   --------------------------------------------------------------------------- */

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
  const [showPassword, setShowPassword] = useState(false);

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

  const heading =
    mode === 'login'
      ? 'Pick up where you left off'
      : mode === 'register'
        ? 'Request your seat'
        : 'Set a new password';

  const blurb =
    mode === 'login'
      ? 'Your session stays on this device until you sign out.'
      : mode === 'register'
        ? 'New accounts are reviewed by an admin before any memory is visible.'
        : 'Paste the one-time token an admin shared with you.';

  return (
    <div className="auth-page relative z-0 min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* ------------------------------------------- full-bleed illustrated left */}
      <aside className="relative isolate hidden overflow-hidden bg-[#0d0b16] lg:block">
        <img
          src="/auth-illustration.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,12,20,0.3) 0%, rgba(10,12,20,0.1) 40%, rgba(10,12,20,0.8) 100%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-10 w-10 rounded-[14px] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)]" />
            <span className="font-display text-[1.35rem] leading-none text-white">Nest</span>
          </div>

          <h1 className="max-w-md font-display text-[2.1rem] leading-[1.1] text-white">
            Replace your worst memories with <span className="glow-text">the best ones.</span>
          </h1>
        </div>
      </aside>

      {/* ------------------------------------------------------- form, right side */}
      <div className="relative flex min-h-dvh items-center justify-center px-3 py-6 sm:px-6 sm:py-10">
        {/* theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="btn-icon absolute right-4 top-4 z-30 !h-9 !w-9 backdrop-blur-xl"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-[var(--accent-amber)]" />
          ) : (
            <Moon className="h-4 w-4 text-[var(--accent-indigo)]" />
          )}
        </button>

        <div className="auth-panel relative w-full max-w-[380px] p-5 sm:p-7">
            <div className="relative">
              {/* compact brand row for phones */}
              <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <img src="/icon.svg" alt="" className="h-9 w-9 rounded-[12px]" />
                <span className="font-display text-base leading-none">Nest</span>
              </div>

              <p className="eyebrow">
                {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join the circle' : 'Reset access'}
              </p>
              <h2 className="mt-1.5 font-display text-[1.5rem] leading-[1.1] tracking-tight sm:text-[1.75rem]">
                {heading}
              </h2>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{blurb}</p>

              {/* segmented tabs */}
              <div className="mt-5 flex gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 p-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMode(t.id);
                      setError(null);
                    }}
                    aria-current={mode === t.id ? 'true' : undefined}
                    className={`flex-1 rounded-xl py-1.5 text-[11px] font-bold transition ${
                      mode === t.id
                        ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[0_4px_12px_-6px_rgba(0,0,0,0.7)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'login' ? 'Your password' : 'At least 10 characters'}
                          className="field pl-9 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => setMode('redeem_reset')}
                          className="mt-1.5 text-[10.5px] font-semibold text-[var(--accent-amber)] transition hover:opacity-80"
                        >
                          Forgot password?
                        </button>
                      )}
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
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 10 characters"
                          className="field pl-9 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
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

              </form>
            </div>
        </div>
      </div>
    </div>
  );
};
