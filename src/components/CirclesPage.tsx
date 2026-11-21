import React, { useMemo, useState } from 'react';
import { Users, Plus, Trash2, Shield, ArrowRight, Sparkles, Search, UserPlus, Lock, KeyRound, Settings2 } from 'lucide-react';
import { Group } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Avatar, Badge, EmptyState, SearchBox, StatTile, PageHero } from './ui/kit.tsx';
import { accentFromName, plural } from '../lib/format.ts';

interface CirclesPageProps {
  groups: Group[];
  selectedGroupId?: string;
  onSelectGroup: (id: string) => void;
  onManage: () => void;
  onCreate: () => void;
  onRequestDelete: (group: Group) => void;
}

export const CirclesPage: React.FC<CirclesPageProps> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
  onManage,
  onCreate,
  onRequestDelete,
}) => {
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q) ||
        g.members?.some((m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
    );
  }, [groups, query]);

  const stats = useMemo(() => {
    const people = new Set(groups.flatMap((g) => (g.members || []).map((m) => m.id)));
    const managed = groups.filter((g) => g.canManage || g.creatorId === user?.id).length;
    return { people: people.size, managed };
  }, [groups, user]);

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Privacy layers"
        title={
          <>
            Small circles.
            <br className="hidden sm:block" /> Carefully chosen people.
          </>
        }
        subtitle="A memory can live in several circles at once. Conversations, reactions and attendance never cross between them."
        accent="amber"
        actions={
          <>
            <button type="button" onClick={onCreate} className="btn btn-primary">
              <Plus className="h-3.5 w-3.5" /> New circle
            </button>
            <button type="button" onClick={onManage} className="btn btn-soft">
              <Settings2 className="h-3.5 w-3.5" /> Manage
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Circles" value={groups.length} hint="you're part of" icon={<Users className="h-4 w-4" />} />
        <StatTile label="People" value={stats.people} hint="unique across circles" tone="mint" icon={<UserPlus className="h-4 w-4" />} />
        <StatTile label="You manage" value={stats.managed} hint="owner or admin" tone="coral" icon={<Shield className="h-4 w-4" />} />
        <StatTile label="Isolation" value="100%" hint="per-circle threads" tone="indigo" icon={<Lock className="h-4 w-4" />} />
      </div>

      <div className="surface flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Search circles or members…" className="flex-1" />
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
          <KeyRound className="h-3 w-3 text-[var(--accent-amber)]" />
          Everyone sees the “Everyone” circle automatically
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No circles match"
          body="Create a circle for a trip, a family group, or just the two people who get the inside jokes."
          action={
            <button type="button" onClick={onCreate} className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" /> Create circle
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g, i) => {
            const memberCount = g.members?.length || g.memberCount || 0;
            const canDelete = !g.isEveryone && (isAdmin || g.canManage || g.creatorId === user?.id);
            const accent = accentFromName(g.name);
            const active = selectedGroupId === g.id;

            return (
              <article
                key={g.id}
                className={`card card-hover group relative overflow-hidden fade-in ${active ? 'border-[var(--accent-amber)]/50' : ''}`}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70"
                  style={{
                    background: `radial-gradient(280px 120px at 18% 0%, color-mix(in oklab, ${accent} 26%, transparent), transparent 72%)`,
                  }}
                />

                <div className="relative p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={g.name} color={accent} size={40} ring />
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[14.5px] leading-tight">{g.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                          <Users className="h-3 w-3" /> {plural(memberCount, 'member')}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {g.isEveryone ? (
                        <Badge tone="mint" dot>
                          Everyone
                        </Badge>
                      ) : (
                        canDelete && (
                          <button
                            type="button"
                            onClick={() => onRequestDelete(g)}
                            title={`Delete ${g.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-rose-500/12 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {g.description ? (
                    <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {g.description}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-[11px] italic leading-relaxed text-[var(--text-muted)]">
                      No description — this one is by invite only.
                    </p>
                  )}

                  {/* member stack */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center">
                      {(g.members || []).slice(0, 5).map((m, idx) => (
                        <span key={m.id} style={{ marginLeft: idx === 0 ? 0 : -8, zIndex: 10 - idx }}>
                          <Avatar name={m.displayName || m.username} color={m.avatarColor} size={22} className="border-2 border-[var(--bg-card)]" />
                        </span>
                      ))}
                      {memberCount > 5 && (
                        <span className="-ml-2 flex h-[22px] items-center rounded-full border-2 border-[var(--bg-card)] bg-[var(--bg-surface-elevated)] px-1.5 text-[9px] font-bold text-[var(--text-secondary)]">
                          +{memberCount - 5}
                        </span>
                      )}
                      {memberCount === 0 && (
                        <span className="text-[10px] text-[var(--text-muted)]">No members yet</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onManage}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                        title="Manage members"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectGroup(g.id)}
                        className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] px-2 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] transition hover:bg-[var(--accent-amber)]/15 hover:text-[var(--accent-amber)]"
                      >
                        Feed <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {g.isEveryone && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-2 text-[10px] leading-relaxed text-emerald-300">
                      <Sparkles className="mt-px h-3 w-3 shrink-0" />
                      Every approved member is added here automatically — perfect for the stuff you don't mind everyone seeing.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
