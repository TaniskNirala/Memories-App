import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Home,
  CalendarDays,
  Users,
  Trash2,
  Shield,
  Upload,
  Copy,
  Moon,
  Sun,
  Bell,
  CornerDownLeft,
  Sparkles,
  ArrowUpRight,
  Settings,
} from 'lucide-react';
import { Group } from '../types/index.ts';
import { useTheme } from '../context/ThemeContext.tsx';

export type PaletteAction =
  | { kind: 'tab'; tab: 'feed' | 'collections' | 'groups' | 'admin' | 'trash' | 'profile' }
  | { kind: 'group'; groupId: string }
  | { kind: 'upload' }
  | { kind: 'duplicates' }
  | { kind: 'theme' }
  | { kind: 'newEvent' };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  run: (action: PaletteAction) => void;
  groups: Group[];
  isAdmin: boolean;
  onSearch?: (query: string) => void;
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  action: PaletteAction;
  keywords?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, run, groups, isAdmin, onSearch }) => {
  const { isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [open]);

  const items: Item[] = useMemo(() => {
    const base: Item[] = [
      { id: 'feed', label: 'Go to timeline', hint: 'Page', icon: <Home className="h-4 w-4" />, action: { kind: 'tab', tab: 'feed' }, keywords: 'home memories stream' },
      { id: 'events', label: 'Go to events', hint: 'Page', icon: <CalendarDays className="h-4 w-4" />, action: { kind: 'tab', tab: 'collections' }, keywords: 'albums trips trips collections' },
      { id: 'circles', label: 'Go to circles', hint: 'Page', icon: <Users className="h-4 w-4" />, action: { kind: 'tab', tab: 'groups' }, keywords: 'friends groups people' },
      { id: 'profile', label: 'Profile & settings', hint: 'Page', icon: <Settings className="h-4 w-4" />, action: { kind: 'tab', tab: 'profile' }, keywords: 'account name username password avatar delete' },
      { id: 'trash', label: 'Open trash bin', hint: 'Page', icon: <Trash2 className="h-4 w-4" />, action: { kind: 'tab', tab: 'trash' }, keywords: 'deleted restore recover' },
      ...(isAdmin
        ? ([
            {
              id: 'admin',
              label: 'Open admin studio',
              hint: 'Page',
              icon: <Shield className="h-4 w-4" />,
              action: { kind: 'tab', tab: 'admin' },
              keywords: 'approvals users reports audit',
            },
          ] as Item[])
        : []),
      { id: 'upload', label: 'Add a memory', hint: 'Action', icon: <Upload className="h-4 w-4" />, action: { kind: 'upload' }, keywords: 'upload photo video new post' },
      { id: 'event', label: 'Propose a new event', hint: 'Action', icon: <Sparkles className="h-4 w-4" />, action: { kind: 'newEvent' }, keywords: 'album trip create' },
      { id: 'dupes', label: 'Find duplicate photos', hint: 'Action', icon: <Copy className="h-4 w-4" />, action: { kind: 'duplicates' }, keywords: 'clean cleanup storage' },
      { id: 'theme', label: isDark ? 'Switch to light mode' : 'Switch to dark mode', hint: 'Action', icon: isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, action: { kind: 'theme' }, keywords: 'appearance dark light theme' },
      { id: 'notif', label: 'Notifications', hint: 'Action', icon: <Bell className="h-4 w-4" />, action: { kind: 'tab', tab: 'feed' }, keywords: 'alerts mentions' },
      ...groups.map((g) => ({
        id: `group-${g.id}`,
        label: `Circle · ${g.name}`,
        hint: `${g.members?.length || g.memberCount} members`,
        icon: <Users className="h-4 w-4" />,
        action: { kind: 'group' as const, groupId: g.id },
        keywords: g.description || '',
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (i) => i.label.toLowerCase().includes(q) || i.keywords?.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
    );
  }, [query, groups, isAdmin, isDark]);

  useEffect(() => setCursor(0), [query]);

  const choose = (item?: Item) => {
    if (!item) return;
    run(item.action);
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="scrim !items-start !pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel max-w-xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(items.length - 1, c + 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            choose(items[cursor]);
          }
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, circle or action…"
            className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--border-color)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]">
            esc
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-[var(--text-muted)]">Nothing matches “{query}”.</p>
              {onSearch && (
                <button
                  type="button"
                  className="btn btn-soft btn-sm mt-3"
                  onClick={() => {
                    onSearch(query);
                    onClose();
                  }}
                >
                  <Search className="h-3.5 w-3.5" /> Search memories for this
                </button>
              )}
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                  i === cursor ? 'bg-[var(--bg-surface-elevated)]' : 'hover:bg-[var(--bg-surface)]'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    i === cursor
                      ? 'border-transparent bg-[var(--accent-amber)]/18 text-[var(--accent-amber)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]/70 text-[var(--text-muted)]'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{item.label}</span>
                <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {item.hint}
                </span>
                {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />}
              </button>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-4 py-2">
          <span className="flex items-center gap-3 text-[9.5px] text-[var(--text-muted)]">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
          </span>
          <span className="hidden items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] sm:flex">
            <ArrowUpRight className="h-3 w-3" /> every feature, one keystroke
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
