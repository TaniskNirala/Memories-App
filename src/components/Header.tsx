import React, { useState, useEffect } from 'react';
import { Moon, Sun, Bell, LogOut, CheckCircle2, Copy } from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { NotificationItem } from '../types/index.ts';

interface HeaderProps {
  onOpenNotifications?: () => void;
  onSelectGroup?: (groupId: string | undefined) => void;
  selectedGroupName?: string;
  onUserSwitched?: () => void;
  onNotificationClick?: (notification: NotificationItem) => void;
  onOpenDuplicates?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ selectedGroupName, onNotificationClick, onOpenDuplicates }) => {
  const { user, logout, isPending } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const fetchNotifications = async () => {
    if (!user || isPending) return;
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user, isPending]);

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch (e) {}
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.read) {
      try {
        await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, read: 1 } : item))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (e) {}
    }
    setShowNotifDropdown(false);
    if (onNotificationClick) {
      onNotificationClick(n);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-md px-4 sm:px-6 py-3 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Title matching user screenshot */}
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] hover:opacity-90 transition"
          >
            Memories
          </a>
          {selectedGroupName && (
            <span className="text-xs text-[var(--accent-coral)] font-medium truncate max-w-[130px] sm:max-w-[200px]">
              / {selectedGroupName}
            </span>
          )}
        </div>

        {/* Right Controls: User Badge & Light/Dark mode */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Current User Badge */}
          {user && !isPending && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0"
                style={{ backgroundColor: user.avatarColor || '#f59e0b' }}
              >
                {user.displayName?.charAt(0) || user.username?.charAt(0)}
              </div>
              <span className="font-semibold text-[var(--text-primary)]">{user.displayName || user.username}</span>
              {user.role === 'admin' && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 font-bold uppercase tracking-wider">
                  Admin
                </span>
              )}
            </div>
          )}

          {/* Light/Dark mode toggle button */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
            className="px-3 py-1.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-xs font-medium text-[var(--text-primary)] transition flex items-center gap-1.5 shrink-0"
          >
            {isDark ? (
              <>
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span>Dark mode</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-600" />
                <span>Light mode</span>
              </>
            )}
          </button>

          {/* Duplicate Photo Cleaner Button */}
          {user && !isPending && onOpenDuplicates && (
            <button
              onClick={onOpenDuplicates}
              title="Duplicate Photo Cleaner"
              className="px-3 py-1.5 rounded-full bg-[var(--bg-surface)] hover:bg-amber-500/20 border border-[var(--border-color)] hover:border-amber-500/30 text-xs font-medium text-[var(--text-primary)] hover:text-amber-400 transition flex items-center gap-1.5 shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Duplicates</span>
            </button>
          )}

          {/* Notifications Trigger */}
          {user && !isPending && (
            <div className="relative">
              <button
                onClick={() => setShowNotifDropdown((prev) => !prev)}
                aria-label="Notifications"
                className="relative w-8 h-8 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition shrink-0"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] p-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl z-50 text-[var(--text-primary)] animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-color)]">
                    <span className="text-xs font-bold">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] text-center py-4">No notifications yet</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`p-2.5 rounded-xl text-xs transition cursor-pointer text-left w-full hover:scale-[1.01] active:scale-[0.99] select-none ${
                            n.read
                              ? 'bg-transparent hover:bg-[var(--bg-surface)]/60 text-[var(--text-muted)]'
                              : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] font-medium border border-amber-500/20 shadow-xs'
                          }`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex items-center gap-1.5">
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                              <span className="text-[11px] font-semibold text-amber-400">{n.title}</span>
                            </div>
                            <span className="text-[9px] text-[var(--text-muted)] shrink-0">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11px] mt-1 leading-snug line-clamp-2">{n.body}</p>
                          {n.link && (
                            <span className="text-[10px] text-[var(--accent-coral)] font-semibold mt-1 inline-flex items-center gap-0.5 hover:underline">
                              View details →
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Sign out */}
          {user && (
            <button
              onClick={logout}
              title="Sign Out"
              className="w-8 h-8 rounded-full bg-[var(--bg-surface)] hover:bg-rose-900/40 border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] hover:text-rose-400 transition shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}

          <PWAInstallButton />
        </div>
      </div>
    </header>
  );
};
