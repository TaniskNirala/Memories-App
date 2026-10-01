import React from 'react';
import { Group } from '../types/index.ts';
import { Plus } from 'lucide-react';

interface CircleRailProps {
  groups: Group[];
  selectedGroupId?: string;
  onSelectGroup: (groupId: string | undefined) => void;
  onOpenCreateGroup: () => void;
}

export const CircleRail: React.FC<CircleRailProps> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
  onOpenCreateGroup,
}) => {
  const getGroupInitials = (name: string, isEveryone: boolean) => {
    if (isEveryone) return 'E';
    const words = name.split(/\s*&\s*|\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getGroupColor = (name: string, isEveryone: boolean) => {
    if (isEveryone) return 'bg-emerald-600 hover:bg-emerald-500';
    const lower = name.toLowerCase();
    if (lower.includes('aarav')) return 'bg-sky-600 hover:bg-sky-500';
    if (lower.includes('kabir')) return 'bg-purple-600 hover:bg-purple-500';
    return 'bg-indigo-600 hover:bg-indigo-500';
  };

  return (
    <aside className="w-16 sm:w-20 shrink-0 sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto overflow-x-hidden flex flex-col items-center py-4 border-r border-[var(--border-color)] bg-[var(--bg-page)] gap-3 select-none transition-colors z-20">
      {/* "All" Circle Button */}
      <button
        onClick={() => onSelectGroup(undefined)}
        title="All Circles"
        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-display font-bold text-xs sm:text-sm transition-all duration-150 ${
          selectedGroupId === undefined
            ? 'border-2 border-amber-500 text-amber-500 bg-amber-500/10 shadow-md shadow-amber-500/20 scale-105'
            : 'border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-color)]'
        }`}
      >
        All
      </button>

      {/* Circle Badges for each group */}
      {groups.map((group) => {
        const isSelected = selectedGroupId === group.id;
        const initials = getGroupInitials(group.name, group.isEveryone);
        const colorClass = getGroupColor(group.name, group.isEveryone);

        return (
          <button
            key={group.id}
            onClick={() => onSelectGroup(group.id)}
            title={group.name}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm text-white transition-all duration-150 ${colorClass} ${
              isSelected
                ? 'ring-3 ring-amber-400 ring-offset-2 ring-offset-[var(--bg-page)] scale-105 shadow-md'
                : 'opacity-85 hover:opacity-100 hover:scale-102'
            }`}
          >
            {initials}
          </button>
        );
      })}

      {/* Add Circle Button */}
      <button
        onClick={onOpenCreateGroup}
        title="Create Circle"
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border border-dashed border-[var(--border-color)] hover:border-amber-400 text-[var(--text-muted)] hover:text-amber-500 flex items-center justify-center transition-colors mt-1"
      >
        <Plus className="w-5 h-5" />
      </button>
    </aside>
  );
};
