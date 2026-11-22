import React from 'react';
import { FeedItem, SinglePostFeedItem, Group } from '../../types/index.ts';
import { Sparkles, MessageSquare, Trash2, MoreHorizontal, X, Flag, Share2, ShieldAlert, SlidersHorizontal, RefreshCw, Maximize2, PencilLine, Users, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { Avatar, Badge, Dropdown, MenuItem, Dot } from '../ui/kit.tsx';
import { relativeTime, accentFromName } from '../../lib/format.ts';
import { MediaFrame } from './TimelineParts.tsx';
import type { OnOpenViewer } from './types.ts';

export const MemoryCard: React.FC<{
  item: SinglePostFeedItem;
  groups: Group[];
  selectedGroupId?: string;
  priority?: boolean;
  onOpenViewer: OnOpenViewer;
  onOpenComments: (item: FeedItem) => void;
  onOpenCollection: (id: string) => void;
  onShare: (item: FeedItem, groupId: string) => void;
  sharing: boolean;
  onEdit: (item: SinglePostFeedItem) => void;
  onConvert: (item: FeedItem) => void;
  onPermissions: (item: FeedItem) => void;
  onDelete: (item: FeedItem) => void;
  onReport: (item: FeedItem) => void;
  onRemoveFromCircle: (item: FeedItem, groupId: string) => void;
  isDeleteProtected: boolean;
}> = React.memo(({
  item,
  groups,
  selectedGroupId,
  priority = false,
  onOpenViewer,
  onOpenComments,
  onShare,
  sharing,
  onEdit,
  onConvert,
  onPermissions,
  onDelete,
  onReport,
  onRemoveFromCircle,
  isDeleteProtected,
}) => {
  const { user } = useAuth();
  const isOwner = user?.id === item.owner.id || item.isOwner;
  const isAdmin = user?.role === 'admin';
  const canManage = isOwner || isAdmin;
  const accent = accentFromName(item.owner.displayName);
  const placementNames = item.placements?.length
    ? item.placements.map((p) => p.groupName).join(', ')
    : 'Only me';

  return (
    <article className="tl-card card overflow-hidden">
      {/* header */}
      <div className="flex items-start justify-between gap-2.5 px-3.5 pt-3.5 sm:gap-3 sm:px-4 sm:pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={item.owner.displayName} color={item.owner.avatarColor} src={item.owner.avatarUrl} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-bold leading-tight">{item.owner.displayName}</span>
              {item.isOwner && <Badge tone="amber">You</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-[var(--text-muted)]">
              <span className="truncate font-mono">@{item.owner.username}</span>
              <Dot />
              <span className="shrink-0">{relativeTime(item.takenAt)}</span>
              <Dot />
              <span className="max-w-[150px] truncate font-medium sm:max-w-[220px]" style={{ color: 'var(--accent-cyan)' }}>
                {placementNames}
              </span>
            </div>
          </div>
        </div>

        <Dropdown
          width={252}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Memory options"
              aria-expanded={open}
              className="btn-icon !h-8 !w-8 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        >
          {({ close }) => (
            <div className="space-y-0.5">
              <MenuItem
                icon={<Maximize2 className="h-3.5 w-3.5" />}
                label="Open full view"
                onClick={() => {
                  close();
                  onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded');
                }}
              />
              <MenuItem
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label="Read comments"
                hint={String(item.commentsCount || '')}
                onClick={() => {
                  close();
                  onOpenComments(item);
                }}
              />
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  <MenuItem
                    icon={<PencilLine className="h-3.5 w-3.5" />}
                    label="Edit date & caption"
                    onClick={() => {
                      close();
                      onEdit(item);
                    }}
                  />
                  <MenuItem
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    label="Convert to event"
                    tone="accent"
                    onClick={() => {
                      close();
                      onConvert(item);
                    }}
                  />
                  <MenuItem
                    icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                    label="Circles & permissions"
                    onClick={() => {
                      close();
                      onPermissions(item);
                    }}
                  />
                </>
              )}
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  <p className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Remove from circle
                  </p>
                  {item.placements?.length ? (
                    item.placements.map((pl) => (
                      <MenuItem
                        key={pl.id || pl.groupId}
                        icon={<X className="h-3.5 w-3.5" />}
                        label={pl.groupName}
                        onClick={() => {
                          close();
                          onRemoveFromCircle(item, pl.groupId);
                        }}
                      />
                    ))
                  ) : selectedGroupId ? (
                    <MenuItem
                      icon={<X className="h-3.5 w-3.5" />}
                      label="This circle"
                      onClick={() => {
                        close();
                        onRemoveFromCircle(item, selectedGroupId);
                      }}
                    />
                  ) : (
                    <p className="px-2.5 py-1 text-[10.5px] text-[var(--text-muted)]">Not shared with a circle</p>
                  )}
                </>
              )}
              {!isOwner && (
                <MenuItem
                  icon={<Flag className="h-3.5 w-3.5" />}
                  label="Report this memory"
                  onClick={() => {
                    close();
                    onReport(item);
                  }}
                />
              )}
              {canManage && (
                <>
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  {isDeleteProtected ? (
                    <div className="tone-amber flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[10px] font-semibold">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Delete is locked in preview
                    </div>
                  ) : (
                    <MenuItem
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="Delete memory"
                      tone="danger"
                      onClick={() => {
                        close();
                        onDelete(item);
                      }}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </Dropdown>
      </div>

      {/* body */}
      <div className="px-3.5 pb-1 pt-3 sm:px-4">
        {item.caption && (
          <p className="mb-2.5 break-words text-[13px] leading-relaxed text-[var(--text-primary)]">{item.caption}</p>
        )}
        <MediaFrame item={item} onOpenViewer={onOpenViewer} onOpenComments={onOpenComments} priority={priority} />
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-3.5 pt-1 sm:px-4 sm:pb-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenComments(item)}
            className="chip hover:text-[var(--text-primary)]"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
            {item.commentsCount > 0 ? `${item.commentsCount} ${item.commentsCount === 1 ? 'comment' : 'comments'}` : 'Add a comment'}
          </button>

          <Dropdown
            width={236}
            align="left"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="chip" disabled={sharing}>
                {sharing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5 text-[var(--accent-amber)]" />}
                {sharing ? 'Sharing…' : 'Share'}
              </button>
            )}
          >
            {({ close }) => (
              <div className="space-y-0.5">
                <p className="px-2.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Share into circle
                </p>
                {groups.length === 0 && (
                  <p className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">No circles yet</p>
                )}
                {groups.map((g) => {
                  const already = item.placements?.some((p) => p.groupId === g.id);
                  return (
                    <MenuItem
                      key={g.id}
                      icon={<Users className="h-3.5 w-3.5" />}
                      label={g.name}
                      hint={already ? '✓' : undefined}
                      onClick={() => {
                        close();
                        onShare(item, g.id);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </Dropdown>
        </div>

        <button
          type="button"
          onClick={() => onOpenViewer(item, 0, item.files.length > 1 ? 'grid' : 'expanded')}
          className="group flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] transition hover:text-[var(--accent-amber)]"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      </div>
    </article>
  );
});

/* ---------------------------------------------------------------------------
   Event card (album)
   --------------------------------------------------------------------------- */
