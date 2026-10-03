import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Calendar,
  User,
  Tag,
  X,
  RotateCcw,
  Sparkles,
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

  // Extract unique contributors from feed items
  const contributors = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string; username: string; avatarColor?: string }>();
    for (const item of items) {
      const author = item.type === 'single_post' ? item.owner : item.creator;
      if (author && author.id && !map.has(author.id)) {
        map.set(author.id, {
          id: author.id,
          displayName: author.displayName || author.username,
          username: author.username,
          avatarColor: author.avatarColor,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [items]);

  // Extract unique tags/hashtags from captions and circle placements
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of items) {
      // Hashtags in caption or title
      const text = item.type === 'single_post' ? (item.caption || '') : `${item.title} ${item.description || ''}`;
      const matches = text.match(/#([\w-]+)/g);
      if (matches) {
        matches.forEach((t) => tagSet.add(t.toLowerCase()));
      }
      // Circles / group placements as tags
      if (item.placements) {
        item.placements.forEach((p) => {
          if (p.groupName && p.groupName !== 'Everyone') {
            tagSet.add(p.groupName.toLowerCase());
          }
        });
      }
    }
    return Array.from(tagSet).sort();
  }, [items]);

  // Count active non-empty filters
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
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      start = toStr(d);
    } else if (preset === '3months') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      start = toStr(d);
    } else if (preset === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      start = toStr(d);
    }

    onFilterChange({ ...filters, startDate: start, endDate: end });
  };

  const selectedContributorName = useMemo(() => {
    if (filters.contributorId === 'all') return null;
    const found = contributors.find((c) => c.id === filters.contributorId);
    return found ? found.displayName : null;
  }, [contributors, filters.contributorId]);

  return (
    <div className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3 sm:p-4 shadow-md space-y-3 transition-all mb-4">
      {/* Search Input & Action Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            placeholder="Search memories by keyword, #tag, or contributor..."
            className="w-full pl-9 pr-9 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              title="Clear search query"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Toggle Button */}
        <button
          onClick={() => setIsFilterPanelOpen((prev) => !prev)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
            isFilterPanelOpen || activeFiltersCount > 0
              ? 'bg-[var(--accent-coral)]/15 border-[var(--accent-coral)] text-[var(--accent-coral)]'
              : 'bg-[var(--bg-surface)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          title="Filter options"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Filter</span>
          {activeFiltersCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[var(--accent-coral)] text-white text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Reset Button (only shown if filters are active) */}
        {activeFiltersCount > 0 && (
          <button
            onClick={onResetFilters}
            className="p-2 rounded-xl bg-[var(--bg-surface)] hover:bg-rose-500/15 border border-[var(--border-color)] hover:border-rose-500/30 text-[var(--text-muted)] hover:text-rose-400 text-xs font-semibold transition shrink-0"
            title="Reset all filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Expanded Filter Panel */}
      {isFilterPanelOpen && (
        <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-3 animate-in fade-in zoom-in-98 duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Contributor Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <User className="w-3 h-3 text-[var(--accent-coral)]" />
                <span>Contributor</span>
              </label>
              <select
                value={filters.contributorId}
                onChange={(e) => onFilterChange({ ...filters, contributorId: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
              >
                <option value="all">All Contributors</option>
                {contributors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} (@{c.username})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Tag Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Tag className="w-3 h-3 text-[var(--accent-amber)]" />
                <span>Tag or Topic</span>
              </label>
              {availableTags.length > 0 ? (
                <select
                  value={filters.tag}
                  onChange={(e) => onFilterChange({ ...filters, tag: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
                >
                  <option value="all">All Tags & Topics</option>
                  {availableTags.map((t) => (
                    <option key={t} value={t}>
                      {t.startsWith('#') ? t : `#${t}`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={filters.tag === 'all' ? '' : filters.tag}
                  onChange={(e) => onFilterChange({ ...filters, tag: e.target.value || 'all' })}
                  placeholder="e.g. #vacation"
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
                />
              )}
            </div>

            {/* 3. Date Range Filter */}
            <div className="space-y-1 sm:col-span-1">
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[var(--accent-cyan)]" />
                <span>Date Range</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-[11px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
                  title="Start Date"
                />
                <span className="text-[var(--text-muted)] text-xs">–</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-[11px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-coral)] transition"
                  title="End Date"
                />
              </div>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="text-[var(--text-muted)] mr-1">Quick dates:</span>
            <button
              onClick={() => handleDatePreset('all')}
              className={`px-2 py-0.5 rounded-lg border transition ${
                !filters.startDate && !filters.endDate
                  ? 'bg-[var(--accent-coral)] text-white border-[var(--accent-coral)] font-semibold'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => handleDatePreset('7days')}
              className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)] transition"
            >
              Past 7 Days
            </button>
            <button
              onClick={() => handleDatePreset('month')}
              className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)] transition"
            >
              This Month
            </button>
            <button
              onClick={() => handleDatePreset('3months')}
              className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)] transition"
            >
              Past 3 Months
            </button>
            <button
              onClick={() => handleDatePreset('year')}
              className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)] transition"
            >
              This Year
            </button>
          </div>

          {/* Popular Tag Pills (if available) */}
          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              <span className="text-[11px] text-[var(--text-muted)] mr-1">Suggested tags:</span>
              {availableTags.slice(0, 6).map((t) => (
                <button
                  key={t}
                  onClick={() => onFilterChange({ ...filters, tag: filters.tag === t ? 'all' : t })}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition ${
                    filters.tag === t
                      ? 'bg-amber-500 text-neutral-950 border-amber-500 shadow-xs'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-amber-400 hover:text-amber-400'
                  }`}
                >
                  {t.startsWith('#') ? t : `#${t}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Filter Chips & Results Count Bar */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]/60 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--text-muted)] text-[11px]">Active:</span>

            {/* Query Chip */}
            {filters.searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] text-[11px]">
                <span>"{filters.searchQuery}"</span>
                <button
                  onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
                  className="hover:text-rose-400 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Contributor Chip */}
            {filters.contributorId !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--accent-coral)]/40 text-[var(--accent-coral)] text-[11px] font-medium">
                <User className="w-2.5 h-2.5" />
                <span>{selectedContributorName || 'Contributor'}</span>
                <button
                  onClick={() => onFilterChange({ ...filters, contributorId: 'all' })}
                  className="hover:text-rose-400 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Tag Chip */}
            {filters.tag !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-amber-500/40 text-amber-400 text-[11px] font-medium">
                <Tag className="w-2.5 h-2.5" />
                <span>{filters.tag.startsWith('#') ? filters.tag : `#${filters.tag}`}</span>
                <button
                  onClick={() => onFilterChange({ ...filters, tag: 'all' })}
                  className="hover:text-rose-400 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Date Range Chip */}
            {(filters.startDate || filters.endDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--accent-cyan)]/40 text-[var(--accent-cyan)] text-[11px] font-medium">
                <Calendar className="w-2.5 h-2.5" />
                <span>
                  {filters.startDate || 'Any'} to {filters.endDate || 'Now'}
                </span>
                <button
                  onClick={() => onFilterChange({ ...filters, startDate: '', endDate: '' })}
                  className="hover:text-rose-400 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Reset All Link */}
            <button
              onClick={onResetFilters}
              className="text-[11px] text-[var(--text-muted)] hover:text-rose-400 underline transition ml-1"
            >
              Reset all
            </button>
          </div>

          {/* Result counter */}
          <span className="text-[11px] text-[var(--text-muted)] font-medium">
            Showing <strong className="text-[var(--text-primary)]">{filteredCount}</strong> of {totalCount}
          </span>
        </div>
      )}
    </div>
  );
};
