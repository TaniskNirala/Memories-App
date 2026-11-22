import React, { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Bell,
  LogOut,
  CheckCircle2,
  Copy,
  RefreshCw,
  ChevronDown,
  KeyRound,
  Sparkles,
  Check,
  Command,
  Search,
  Settings2,
  Shield,
  Trash2,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { NotificationItem } from '../types/index.ts';
import { Avatar, Modal, ModalHeader, MenuItem } from './ui/kit.tsx';
import { relativeTime } from '../lib/format.ts';

interface HeaderProps {
  onOpenProfile?: () => void;
  onOpenAdmin?: () => void;
  onOpenTrash?: () => void;
  onOpenNotifications?: () => void;
  onSelectGroup?: (groupId: string | undefined) => void;
  selectedGroupName?: string;
  onUserSwitched?: () => void;
  onNotificationClick?: (notification: NotificationItem) => void;
  onOpenDuplicates?: () => void;
  onOpenPalette?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedGroupName,
  onOpenProfile,
  onOpenAdmin,
  onOpenTrash,
  onNotificationClick,
  onOpenDuplicates,
  onOpenPalette,
}) => {
  const { user, logout, isPending, isAdmin } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* Any click outside the menus closes them — including clicks on the page,
     other header controls and the overlay used behind the panels. */
  useEffect(() => {
    if (!showUserMenu && !showNotif) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (notifRef.current?.contains(target) || userMenuRef.current?.contains(target)) return;
      setShowUserMenu(false);
      setShowNotif(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, { capture: true, passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [showUserMenu, showNotif]);

  const fetchNotifications = async () => {
    if (!user || isPending) return;
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchNotifications();
    }, 25000);
    const onVisible = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, isPending]);

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch {}
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.read) {
      try {
        await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
        setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: 1 } : item)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {}
    }
    setShowNotif(false);
    if (onNotificationClick) onNotificationClick(n);
  };

  return (
    <>
      <div className="sticky top-0 z-50 w-full px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 sm:pt-3 transform-gpu">
        <header className="page-wrap !px-0">
          <div className="flex h-[54px] items-center gap-1.5 rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-card)]/96 lg:bg-[color-mix(in_oklab,var(--bg-card)_92%,transparent)] px-2 shadow-[0_14px_32px_-26px_rgba(0,0,0,0.85)] lg:backdrop-blur-xl sm:h-[58px] sm:gap-3 sm:px-3.5">
            {/* ---- identity */}
            <a
              href="/"
              className="group flex min-w-0 shrink-0 items-center gap-2 text-[var(--text-primary)] transition hover:opacity-95"
              aria-label="Nest home"
            >
              <img
                src="/icon.svg"
                alt=""
                className="h-8 w-8 shrink-0 rounded-[11px] shadow-[0_6px_16px_-10px_rgba(249,101,95,0.9)]"
              />
              <span className="hidden font-display text-[1.05rem] font-bold leading-none tracking-tight sm:block">Nest</span>
            </a>

            {selectedGroupName && (
              <span className="hidden max-w-[30vw] items-center gap-1.5 truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-2 py-0.5 text-[10.5px] font-semibold text-[var(--text-secondary)] md:flex">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-teal)]" />
                <span className="truncate">{selectedGroupName}</span>
              </span>
            )}

            {/* ---- command bar sits centred, like a real app shell */}
            {onOpenPalette && (
              <button
                type="button"
                onClick={onOpenPalette}
                className="group mx-auto flex h-9 min-w-0 flex-1 max-w-[420px] items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 px-2.5 text-[11.5px] text-[var(--text-muted)] transition hover:border-[var(--accent-amber)]/40 hover:text-[var(--text-secondary)] sm:px-3"
              >
                <Search className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Search or jump…</span>
                  <span className="hidden sm:inline">Search memories, people, circles…</span>
                </span>
                <kbd className="ml-auto hidden shrink-0 rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[9px] sm:block">
                  ⌘K
                </kbd>
              </button>
            )}

            {/* ---- actions, grouped into one pill */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <div className="flex items-center gap-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/45 p-0.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label="Toggle theme"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                >
                  {isDark ? (
                    <Sun className="h-4 w-4 text-[var(--accent-amber)]" />
                  ) : (
                    <Moon className="h-4 w-4 text-[var(--accent-indigo)]" />
                  )}
                </button>

                {user && !isPending && onOpenDuplicates && (
                  <button
                    type="button"
                    onClick={onOpenDuplicates}
                    title="Duplicate photo cleaner"
                    aria-label="Duplicate photo cleaner"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}

                <span className="hidden sm:block">
                  <PWAInstallButton />
                </span>

                {user && !isPending && (
                  <div className="relative" ref={notifRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotif((v) => !v);
                        setShowUserMenu(false);
                      }}
                      aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 && (
                        <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[8.5px] font-bold text-white">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>
                {showNotif && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setShowNotif(false)} />
                    <div className="fixed inset-x-3 top-[66px] z-[60] max-h-[75dvh] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-float)] lg:backdrop-blur-xl fade-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[340px]">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm">Notifications</span>
                          {unreadCount > 0 && (
                            <span className="rounded-full bg-[var(--accent-amber)]/18 px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent-amber)]">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllRead}
                            className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--accent-amber)] transition hover:underline"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Mark all read
                          </button>
                        )}
                      </div>

                      <div className="max-h-[62vh] overflow-y-auto p-1.5">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-10 text-center">
                            <Bell className="mx-auto mb-2 h-5 w-5 text-[var(--text-muted)]" />
                            <p className="text-[11px] text-[var(--text-muted)]">You're all caught up.</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => handleNotificationClick(n)}
                              className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                                n.read
                                  ? 'hover:bg-[var(--bg-surface)]/70'
                                  : 'bg-[var(--bg-surface)]/80 hover:bg-[var(--bg-surface-elevated)]'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {!n.read ? (
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-amber)]" />
                                ) : (
                                  <Check className="mt-1 h-3 w-3 shrink-0 text-[var(--text-muted)]/60" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <span
                                      className={`truncate text-[11.5px] ${
                                        n.read ? 'font-medium text-[var(--text-secondary)]' : 'font-bold text-[var(--text-primary)]'
                                      }`}
                                    >
                                      {n.title}
                                    </span>
                                    <span className="shrink-0 font-mono text-[9px] text-[var(--text-muted)]">
                                      {relativeTime(n.created_at)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                                    {n.body}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
                  </div>
                )}
              </div>

              {user && !isPending && (
                <div className="relative ml-0.5" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu((v) => !v);
                      setShowNotif(false);
                    }}
                    aria-label="Account menu"
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/55 pl-1 pr-1.5 transition hover:border-[var(--accent-amber)]/45 hover:bg-[var(--bg-surface-elevated)]"
                  >
                    <Avatar name={user.displayName || user.username} color={user.avatarColor} src={user.avatarUrl} size={26} ring />
                    <span className="hidden max-w-[104px] truncate text-[11.5px] font-semibold md:block">
                      {user.displayName || user.username}
                    </span>
                    <ChevronDown
                      className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 z-[60] mt-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-float)] lg:backdrop-blur-xl fade-in">
                        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-3.5 py-3">
                          <Avatar name={user.displayName || user.username} color={user.avatarColor} src={user.avatarUrl} size={38} ring />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold">{user.displayName}</p>
                            <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">@{user.username}</p>
                          </div>
                        </div>

                        <div className="p-1.5">
                          {onOpenProfile && (
                            <MenuItem
                              icon={<Settings2 className="h-3.5 w-3.5" />}
                              label="Profile & settings"
                              hint="⌘"
                              onClick={() => {
                                setShowUserMenu(false);
                                onOpenProfile();
                              }}
                            />
                          )}
                          {isAdmin && onOpenAdmin && (
                            <MenuItem
                              icon={<Shield className="h-3.5 w-3.5" />}
                              label="Admin studio"
                              tone="accent"
                              onClick={() => {
                                setShowUserMenu(false);
                                onOpenAdmin();
                              }}
                            />
                          )}
                          {onOpenTrash && (
                            <MenuItem
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              label="Trash bin"
                              onClick={() => {
                                setShowUserMenu(false);
                                onOpenTrash();
                              }}
                            />
                          )}
                          <div className="my-1 h-px bg-[var(--border-subtle)]" />
                          <MenuItem
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            label="Account & security"
                            onClick={() => {
                              setShowUserMenu(false);
                              if (onOpenProfile) onOpenProfile();
                            }}
                          />
                          <MenuItem
                            icon={<LogOut className="h-3.5 w-3.5" />}
                            label="Sign out"
                            onClick={() => {
                              setShowUserMenu(false);
                              logout();
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      </div>

    </>
  );
};
