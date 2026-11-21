import React, { useMemo, useState } from 'react';
import {
  SlidersHorizontal,
  Calendar,
  User,
  Tag,
  X,
  RotateCcw,
  Search,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { FeedItem } from '../types/index.ts';

export interface FeedFilterState {
  searchQuery: string;
  contributorId: string;
  tag: string;
  startDate: string;
  endDate: string;
}

interface FeedSearchBarProps {
  filters: FeedFilterState;
  onFilterChange: (filters: FeedFilterState) => void;
  onResetFilters: () => void;
  items: FeedItem[];
  filteredCount: number;
  totalCount: number;
}

export const FeedSearchBar: React.FC<FeedSearchBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  items,
  filteredCount,
  totalCount,
}) => {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const contributors = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string; username: string }>();
    for (const item of items) {
      const author = item.type === 'single_post' ? item.owner : item.creator;
      if (author?.id && !map.has(author.id)) {
        map.set(author.id, {
          id: author.id,
          displayName: author.displayName || author.username,
          username: author.username,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [items]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of items) {
      const text = item.type === 'single_post' ? item.caption || '' : `${item.title} ${item.description || ''}`;
      const matches = text.match(/#([\w-]+)/g);
      matches?.forEach((t) => tagSet.add(t.toLowerCase()));
      item.placements?.forEach((p) => {
        if (p.groupName && p.groupName !== 'Everyone') tagSet.add(p.groupName.toLowerCase());
      });
    }
    return Array.from(tagSet).sort();
  }, [items]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery.trim()) count++;
    if (filters.contributorId && filters.contributorId !== 'all') count++;
    if (filters.tag && filters.tag !== 'all') count++;
    if (filters.startDate || filters.endDate) count++;
    return count;
  }, [filters]);

  const handleDatePreset = (preset: 'all' | '7days' | 'month' | '3months' | 'year') => {
    const now = new Date();
    const toStr = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'all') {
      onFilterChange({ ...filters, startDate: '', endDate: '' });
      return;
    }
    const end = toStr(now);
    let start = '';
    if (preset === '7days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      start = toStr(d);
    } else if (preset === 'month') {
      start = toStr(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (preset === '3months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      start = toStr(d);
    } else if (preset === 'year') {
      start = toStr(new Date(now.getFullYear(), 0, 1));
    }
    onFilterChange({ ...filters, startDate: start, endDate: end });
  };

  const selectedContributorName = useMemo(() => {
    if (filters.contributorId === 'all') return null;
    return contributors.find((c) => c.id === filters.contributorId)?.displayName || null;
  }, [contributors, filters.contributorId]);

  const presets: { id: 'all' | '7days' | 'month' | '3months' | 'year'; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: '7days', label: '7 days' },
    { id: 'month', label: 'This month' },
    { id: '3months', label: '3 months' },
    { id: 'year', label: 'This year' },
  ];

  return (
    <section className="surface mb-4 overflow-hidden">
      {/* Search row */}
      <div className="flex items-center gap-2 p-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search memories, people, #tags or circles…"
            className="field !rounded-full !border-transparent !bg-[var(--bg-surface)]/80 !py-2.5 pl-10 pr-9 text-[12.5px] focus:!border-[var(--accent-amber)]/50"
            aria-label="Search memories"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsFilterPanelOpen((v) => !v)}
          aria-expanded={isFilterPanelOpen}
          className={`btn shrink-0 !rounded-full btn-sm ${
            isFilterPanelOpen || activeFiltersCount > 0 ? 'btn-primary' : 'btn-soft'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeFiltersCount > 0 && (
            <span
              className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                isFilterPanelOpen || activeFiltersCount > 0
                  ? 'bg-black/25 text-current'
                  : 'bg-[var(--accent-coral)] text-white'
              }`}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>

        {activeFiltersCount > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="btn-icon !h-9 !w-9"
            title="Reset all filters"
            aria-label="Reset all filters"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter panel */}
      {isFilterPanelOpen && (
        <div className="fade-in space-y-3.5 border-t border-[var(--border-subtle)] px-3 pb-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <User className="h-3 w-3 text-[var(--accent-coral)]" /> Contributor
              </label>
              <div className="relative">
                <select
                  value={filters.contributorId}
                  onChange={(e) => onFilterChange({ ...filters, contributorId: e.target.value })}
                  className="field appearance-none pr-8 text-[12px]"
                >
                  <option value="all">Everyone</option>
                  {contributors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} (@{c.username})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>

            <div>
              <label className="label flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-[var(--accent-amber)]" /> Tag or topic
              </label>
              {availableTags.length > 0 ? (
                <div className="relative">
                  <select
                    value={filters.tag}
                    onChange={(e) => onFilterChange({ ...filters, tag: e.target.value })}
                    className="field appearance-none pr-8 text-[12px]"
                  >
                    <option value="all">Any tag</option>
                    {availableTags.map((t) => (
                      <option key={t} value={t}>
                        {t.startsWith('#') ? t : `#${t}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
              ) : (
                <input
                  value={filters.tag === 'all' ? '' : filters.tag}
                  onChange={(e) => onFilterChange({ ...filters, tag: e.target.value || 'all' })}
                  placeholder="e.g. #vacation"
                  className="field text-[12px]"
                />
              )}
            </div>

            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-[var(--accent-cyan)]" /> Date range
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
                  className="field !px-2 text-[11px]"
                  aria-label="Start date"
                />
                <span className="text-[var(--text-muted)]">–</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
                  className="field !px-2 text-[11px]"
                  aria-label="End date"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-1">Quick dates</span>
            {presets.map((p) => {
              const active =
                p.id === 'all'
                  ? !filters.startDate && !filters.endDate
                  : Boolean(filters.startDate && filters.endDate);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleDatePreset(p.id)}
                  className={`chip ${active && p.id !== 'all' ? 'chip-active' : ''}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Suggested
              </span>
              {availableTags.slice(0, 8).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onFilterChange({ ...filters, tag: filters.tag === t ? 'all' : t })}
                  className={`chip ${filters.tag === t ? 'chip-active' : ''}`}
                >
                  {t.startsWith('#') ? t : `#${t}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active chips + result counter */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.searchQuery && (
              <span className="chip chip-active">
                “{filters.searchQuery}”
                <button type="button" onClick={() => onFilterChange({ ...filters, searchQuery: '' })} aria-label="Clear query">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.contributorId !== 'all' && (
              <span className="chip chip-active">
                <User className="h-2.5 w-2.5" /> {selectedContributorName || 'Contributor'}
                <button type="button" onClick={() => onFilterChange({ ...filters, contributorId: 'all' })} aria-label="Clear contributor">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.tag !== 'all' && (
              <span className="chip chip-active">
                <Tag className="h-2.5 w-2.5" /> {filters.tag.startsWith('#') ? filters.tag : `#${filters.tag}`}
                <button type="button" onClick={() => onFilterChange({ ...filters, tag: 'all' })} aria-label="Clear tag">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {(filters.startDate || filters.endDate) && (
              <span className="chip chip-active">
                <Calendar className="h-2.5 w-2.5" /> {filters.startDate || 'Any'} → {filters.endDate || 'Now'}
                <button
                  type="button"
                  onClick={() => onFilterChange({ ...filters, startDate: '', endDate: '' })}
                  aria-label="Clear dates"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <button type="button" onClick={onResetFilters} className="text-[10.5px] font-semibold text-[var(--text-muted)] underline-offset-2 hover:text-rose-400 hover:underline">
              Reset all
            </button>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {filteredCount} / {totalCount} shown
          </span>
        </div>
      )}
    </section>
  );
};
