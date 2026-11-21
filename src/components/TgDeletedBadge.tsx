import React from 'react';
import { Trash2 } from 'lucide-react';

interface TgDeletedBadgeProps {
  /** Corner placement inside a `relative` media container */
  position?: 'bottom-left' | 'top-left' | 'bottom-right';
  /** Smaller pill for thumbnail strips */
  compact?: boolean;
}

const POSITION_CLASSES: Record<NonNullable<TgDeletedBadgeProps['position']>, string> = {
  'bottom-left': 'bottom-2 left-2',
  'top-left': 'top-2 left-2',
  'bottom-right': 'bottom-2 right-2',
};

/**
 * Small red pill shown on media that was deleted from the Telegram channel.
 * Must be rendered inside a `relative` container.
 */
export function TgDeletedBadge({ position = 'bottom-left', compact = false }: TgDeletedBadgeProps) {
  return (
    <span
      title="This file was deleted from Telegram"
      className={`absolute z-10 ${POSITION_CLASSES[position]} inline-flex items-center gap-1 rounded-full bg-rose-600/95 text-white font-bold uppercase tracking-wide shadow-lg pointer-events-none ${
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      <Trash2 className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {compact ? 'Deleted' : 'Deleted from TG'}
    </span>
  );
}
