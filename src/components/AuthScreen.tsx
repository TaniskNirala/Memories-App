import React, { useState } from 'react';
import { Lock, User, Key, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

export const AuthScreen: React.FC = () => {
  const { login, register } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  // Reset links look like /reset-password#token=...; the fragment never reaches the server
  const initialResetToken = (() => {
    try {
      const m = /(?:^#|&)token=([A-Za-z0-9]+)/.exec(window.location.hash) || /[?&]token=([A-Za-z0-9]+)/.exec(window.location.search);
      return m ? m[1] : '';
    } catch {
      return '';
    }
  })();

  const [mode, setMode] = useState<'login' | 'register' | 'redeem_reset'>(initialResetToken ? 'redeem_reset' : 'login');
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
        if (!res.success) {
          setError(res.error || 'Login failed');
        }
      } else if (mode === 'register') {
        const res = await register(username, password, displayName);
        if (!res.success) {
          setError(res.error || 'Registration failed');
        }
      } else if (mode === 'redeem_reset') {
        const res = await fetch('/api/auth/redeem-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken.trim(), newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccessMsg(data.message || 'Password reset successfully! Please log in.');
          setMode('login');
          if (initialResetToken) window.history.replaceState(null, '', '/');
        } else {
          setError(data.error || 'Failed to redeem password reset link');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors">
      <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl p-6 sm:p-8 playful-card relative">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <img
            src="/icon.svg"
            alt="Nest"
            className="w-14 h-14 rounded-2xl mx-auto mb-3 shadow-lg playful-btn"
          />
          <h1 className="font-display font-bold text-2xl tracking-tight text-[var(--text-primary)]">
            Nest
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Private, zero-quota memory sharing for close friends
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex p-1 bg-[var(--bg-surface)] rounded-2xl mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-xl transition ${
              mode === 'login' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-xl transition ${
              mode === 'register' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('redeem_reset');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-xl transition ${
              mode === 'redeem_reset' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            Reset Link
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Your Display Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maya Lin"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
                />
                <User className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              </div>
            </div>
          )}

          {mode !== 'redeem_reset' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. maya"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
                  />
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 10 characters"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
                  />
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  One-Time Reset Token
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste token provided by admin"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                  />
                  <Key className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 10 characters"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
                  />
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs shadow-md transition flex items-center justify-center gap-1.5 playful-btn mt-2"
          >
            <span>
              {loading
                ? 'Processing...'
                : mode === 'login'
                ? 'Sign In to Nest'
                : mode === 'register'
                ? 'Register Account'
                : 'Save New Password'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
