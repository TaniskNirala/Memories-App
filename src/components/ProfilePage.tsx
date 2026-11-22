import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User as UserIcon,
  AtSign,
  Palette,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Check,
  LogOut,
  Trash2,
  ArrowRight,
  BellRing,
  ImagePlus,
  X,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { Avatar, PageHero, Modal, ModalHeader } from './ui/kit.tsx';

/* ---------------------------------------------------------------------------
   Profile & settings

   Everything about "me" lives here: display name, handle, avatar colour,
   password, theme, session sign-out and account deletion. The header keeps a
   shortcut, but this page is the single place these actions belong.
   --------------------------------------------------------------------------- */

const PALETTE = [
  '#f6b544',
  '#ff7069',
  '#5eead4',
  '#9b9bff',
  '#34d399',
  '#f472b6',
  '#38bdf8',
  '#fb923c',
  '#a3e635',
  '#c084fc',
];

export const ProfilePage: React.FC = () => {
  const { user, logout, refreshUser, updateProfile, uploadAvatar, removeAvatar } = useAuth();
  const { theme, setTheme } = useTheme();

  /* ---------------------------------------------------------------- profile */
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || PALETTE[0]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(user?.displayName || '');
    setUsername(user?.username || '');
    setAvatarColor(user?.avatarColor || PALETTE[0]);
  }, [user?.id, user?.displayName, user?.username, user?.avatarColor]);

  /* ---------------------------------------------------------------- avatar */
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const handleAvatarUpload = async (file: File) => {
    setAvatarMsg(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setAvatarMsg({ tone: 'error', text: 'Pick a PNG, JPEG or WebP image' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg({ tone: 'error', text: 'That image is larger than 2 MB' });
      return;
    }
    setAvatarBusy(true);
    const res = await uploadAvatar(file);
    setAvatarBusy(false);
    setAvatarMsg(
      res.success ? { tone: 'ok', text: 'Profile photo updated' } : { tone: 'error', text: res.error || 'Upload failed' }
    );
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    const res = await removeAvatar();
    setAvatarBusy(false);
    setAvatarMsg(
      res.success ? { tone: 'ok', text: 'Photo removed — using your initials' } : { tone: 'error', text: res.error || 'Could not remove' }
    );
  };

  const usernameChanged = username.trim().toLowerCase() !== (user?.username || '');
  const profileDirty =
    displayName.trim() !== (user?.displayName || '') || usernameChanged || avatarColor !== user?.avatarColor;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    const res = await updateProfile({
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      avatarColor,
      ...(usernameChanged ? { currentPassword } : {}),
    });
    setSavingProfile(false);
    if (!res.success) {
      setProfileMsg({ tone: 'error', text: res.error || 'Could not save' });
      return;
    }
    setCurrentPassword('');
    setProfileMsg({ tone: 'ok', text: res.message || 'Profile saved' });
  };

  /* --------------------------------------------------------------- password */
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwNext !== pwConfirm) {
      setPwMsg({ tone: 'error', text: 'The two new passwords do not match' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwMsg({ tone: 'error', text: data.error || 'Could not change your password' });
      } else {
        setPwCurrent('');
        setPwNext('');
        setPwConfirm('');
        setPwMsg({ tone: 'ok', text: data.message || 'Password changed' });
      }
    } catch {
      setPwMsg({ tone: 'error', text: 'Network error — please try again' });
    } finally {
      setPwSaving(false);
    }
  };

  /* --------------------------------------------------------------- sessions */
  const [signingOut, setSigningOut] = useState(false);
  const signOutEverywhere = async () => {
    setSigningOut(true);
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
    } finally {
      setSigningOut(false);
      logout();
    }
  };

  /* ---------------------------------------------------------------- deletion */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || 'Could not delete your account');
        return;
      }
      await logout();
    } catch {
      setDeleteError('Network error — please try again');
    } finally {
      setDeleteLoading(false);
    }
  };

  const previewName = displayName.trim() || user?.username || 'you';
  const previewColor = useMemo(() => avatarColor || PALETTE[0], [avatarColor]);

  return (
    <div className="space-y-5 pb-6">
      <PageHero
        eyebrow="Your account"
        title={
          <>
            Profile &amp; <span className="glow-text">settings</span>
          </>
        }
        subtitle="Your name, handle, avatar colour, password and session — all in one place."
        aside={
          <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-3 py-2">
            <Avatar name={previewName} color={previewColor} size={34} ring />
            <div className="leading-tight">
              <p className="text-[11.5px] font-bold">{previewName}</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                @{user?.username}
              </p>
            </div>
          </div>
        }
      />

      {/* ------------------------------------------------------------- identity */}
      <form onSubmit={saveProfile} className="surface overflow-hidden">
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent-amber)]">
            <UserIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight">Who you are</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              This is the name circles see on every memory you share.
            </p>
          </div>
        </div>

        <div className="space-y-3.5 p-4">
          {/* profile photo */}
          <div className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/45 p-3">
            <div className="relative">
              <Avatar name={previewName} color={previewColor} src={user?.avatarUrl} size={64} ring />
              {avatarBusy && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold">Profile photo</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
                PNG, JPEG or WebP up to 2 MB. Your photo replaces the colour initials; if it cannot load, the
                initials return with a small red dot.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAvatarUpload(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="btn btn-soft btn-sm"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {user?.avatarUrl ? 'Replace photo' : 'Upload photo'}
                </button>
                {user?.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => void handleAvatarRemove()}
                    disabled={avatarBusy}
                    className="btn btn-ghost btn-sm"
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              {avatarMsg && (
                <p
                  className={`mt-1.5 text-[10px] font-medium ${
                    avatarMsg.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {avatarMsg.text}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="profile-name">
                Display name
              </label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  placeholder="Maya Lin"
                  className="field pl-9"
                />
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Up to 60 characters.</p>
            </div>

            <div>
              <label className="label" htmlFor="profile-username">
                Username
              </label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="profile-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  maxLength={30}
                  placeholder="maya"
                  className="field pl-9 font-mono text-[12.5px]"
                />
              </div>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                3–30 characters · a–z, 0–9, - and _. You'll sign in with this.
              </p>
            </div>
          </div>

          {usernameChanged && (
            <div className="fade-in">
              <label className="label" htmlFor="profile-confirm-password">
                Confirm with your current password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="profile-confirm-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required to change your handle"
                  className="field pl-9"
                />
              </div>
            </div>
          )}

          {/* avatar colour */}
          <div>
            <span className="label flex items-center gap-1.5">
              <Palette className="h-3 w-3" /> Avatar colour
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map((c) => {
                const active = c.toLowerCase() === avatarColor.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    aria-label={`Use ${c} as avatar colour`}
                    aria-pressed={active}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                      active ? 'border-[var(--text-primary)] scale-105' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ background: c }}
                  >
                    {active && <Check className="h-3.5 w-3.5 text-black/70" strokeWidth={3} />}
                  </button>
                );
              })}
              <span className="ml-1 flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 py-1 pl-1 pr-2.5">
                <Avatar name={previewName} color={previewColor} size={22} />
                <span className="text-[10px] font-semibold text-[var(--text-muted)]">preview</span>
              </span>
            </div>
          </div>

          {profileMsg && (
            <p
              className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                profileMsg.tone === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {profileMsg.text}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDisplayName(user?.displayName || '');
                setUsername(user?.username || '');
                setAvatarColor(user?.avatarColor || PALETTE[0]);
                setCurrentPassword('');
                setProfileMsg(null);
              }}
              disabled={!profileDirty || savingProfile}
              className="btn btn-ghost btn-sm"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={!profileDirty || savingProfile || (usernameChanged && !currentPassword)}
              className="btn btn-primary btn-sm"
            >
              {savingProfile ? 'Saving…' : 'Save changes'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </form>

      {/* ------------------------------------------------------------- password */}
      <form onSubmit={savePassword} className="surface overflow-hidden">
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent-cyan)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight">Password</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Changing it signs every other device out.
            </p>
          </div>
        </div>

        <div className="space-y-3.5 p-4">
          <div>
            <label className="label" htmlFor="pw-current">
              Current password
            </label>
            <input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="field"
              required
            />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pw-next">
                New password
              </label>
              <input
                id="pw-next"
                type="password"
                autoComplete="new-password"
                value={pwNext}
                onChange={(e) => setPwNext(e.target.value)}
                placeholder="At least 10 characters"
                className="field"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="pw-confirm">
                Repeat new password
              </label>
              <input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                className="field"
                required
              />
            </div>
          </div>

          {pwMsg && (
            <p
              className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                pwMsg.tone === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {pwMsg.text}
            </p>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={pwSaving} className="btn btn-soft btn-sm">
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </div>
      </form>

      {/* ------------------------------------------------------ appearance etc. */}
      <section className="surface overflow-hidden">
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent-indigo)]">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight">Preferences &amp; sessions</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Theme and where you are signed in.</p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-3 py-2.5">
            <div>
              <p className="text-[11.5px] font-bold">Appearance</p>
              <p className="text-[10px] text-[var(--text-muted)]">Switch between the dark and light palette.</p>
            </div>
            <div className="flex gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/70 p-1">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold capitalize transition ${
                    theme === t
                      ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-3 py-2.5">
            <div>
              <p className="text-[11.5px] font-bold">Sign out everywhere</p>
              <p className="text-[10px] text-[var(--text-muted)]">Ends this session and every other device.</p>
            </div>
            <button type="button" onClick={signOutEverywhere} disabled={signingOut} className="btn btn-soft btn-sm">
              <LogOut className="h-3.5 w-3.5" /> {signingOut ? 'Signing out…' : 'Sign out all'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void refreshUser()}
            className="text-[10.5px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            Refresh account details
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------------- danger zone */}
      <section className="overflow-hidden rounded-[22px] border border-rose-500/25 bg-rose-500/[0.04]">
        <div className="flex items-start gap-3 border-b border-rose-500/20 px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight text-rose-200">Danger zone</p>
            <p className="mt-0.5 text-[11px] text-rose-300/70">
              Deleting your account removes every memory, album, comment and circle membership you own. It cannot be
              undone.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 p-4">
          <p className="text-[10.5px] text-[var(--text-muted)]">
            Your handle is <span className="font-mono text-[var(--text-secondary)]">@{user?.username}</span>
          </p>
          <button type="button" onClick={() => setDeleteOpen(true)} className="btn btn-danger btn-sm">
            <Trash2 className="h-3.5 w-3.5" /> Delete account
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------ delete confirm */}
      <Modal
        open={deleteOpen}
        onClose={() => !deleteLoading && setDeleteOpen(false)}
        size="sm"
        label="Delete account"
      >
        <ModalHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          eyebrow="Danger zone"
          title="Delete my account"
          onClose={() => !deleteLoading && setDeleteOpen(false)}
        />
        <div className="space-y-3 p-5">
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            This permanently removes <strong>@{user?.username}</strong> along with every memory, album, comment and
            circle membership attached to it.
          </p>
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-rose-300">
            This cannot be undone and there is no recovery window.
          </p>
          <div>
            <label className="label" htmlFor="profile-delete-password">
              Confirm with your password
            </label>
            <input
              id="profile-delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Password"
              className="field"
            />
          </div>
          {deleteError && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
              {deleteError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={deleteLoading}
              onClick={() => setDeleteOpen(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteLoading || !deletePassword}
              onClick={deleteAccount}
              className="btn btn-danger btn-sm"
            >
              {deleteLoading ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
