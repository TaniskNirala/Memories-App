import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Plus,
  UserPlus,
  LogOut,
  Trash2,
  Edit3,
  Check,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Group, GroupMember } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { Avatar } from './ui/kit.tsx';
import { errMessage } from '../lib/errors.ts';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onRefreshGroups: () => void;
  onSelectGroupFeed?: (groupId: string | undefined) => void;
  initialCreateMode?: boolean;
  onGroupDeleted?: (groupId: string) => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  isOpen,
  onClose,
  groups,
  onRefreshGroups,
  onSelectGroupFeed,
  initialCreateMode = false,
  onGroupDeleted,
}) => {
  const { user, isAdmin } = useAuth();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(initialCreateMode);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);

  // In-app Delete Confirmation Modal state (avoids browser window.confirm being blocked by iframe)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Leave circle modal state
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);

  const fetchAvailableUsers = async () => {
    try {
      const res = await apiFetch('/api/groups/available-users');
      if (res.ok) {
        const data = await res.json();
        setAvailableUsers(data.users || []);
      }
    } catch (e) {
      console.error('Failed to fetch available users', e);
    }
  };

  /* `groups` is a fresh array on every parent render, so keying this effect on
     the array itself would re-run (and re-select something) constantly. */
  useEffect(() => {
    if (isOpen) {
      fetchAvailableUsers();
      setCreateError(null);
      if (initialCreateMode) {
        // Opening straight into "new circle": render ONLY the Create Circle
        // popup with no background Manage panel behind it.
        setShowCreateModal(true);
        setSelectedGroup(null);
        return;
      }
      setShowCreateModal(false);
      if (selectedGroup) {
        // Keep selected group updated with fresh props
        const fresh = groups.find((g) => g.id === selectedGroup.id);
        if (fresh) {
          setSelectedGroup(fresh);
        } else if (groups.length > 0) {
          setSelectedGroup(groups[0]);
        }
      } else if (groups.length > 0) {
        setSelectedGroup(groups[0]);
      }
    }
  }, [isOpen, initialCreateMode, groups.length]);

  /* A circle that was just created is selected once the refetched list includes
     it, so the sheet closes onto the circle you made rather than a blank pane. */
  useEffect(() => {
    if (!pendingSelectId) return;
    const created = groups.find((g) => g.id === pendingSelectId);
    if (created) {
      setSelectedGroup(created);
      setPendingSelectId(null);
    }
  }, [groups, pendingSelectId]);

  const closeCreateSheet = () => {
    setShowCreateModal(false);
    setCreateError(null);
    if (initialCreateMode) {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteModal) {
          if (!deleteLoading) setShowDeleteModal(false);
        } else if (showLeaveModal) {
          if (!leaveLoading) setShowLeaveModal(false);
        } else if (showCreateModal) {
          closeCreateSheet();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, showDeleteModal, deleteLoading, showLeaveModal, leaveLoading, showCreateModal, initialCreateMode]);

  if (!isOpen) return null;

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          memberIds: selectedUserIds,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreateError(null);
        setNewGroupName('');
        setNewGroupDesc('');
        setSelectedUserIds([]);
        setShowCreateModal(false);
        onRefreshGroups();
        if (initialCreateMode) {
          // When opened directly via "Create Circle" / "New Circle", finish and close cleanly
          onClose();
          return;
        }
        // POST /api/groups answers { groupId }; select it once the parent's
        // refetch has delivered the new circle.
        const createdId = data.group?.id || data.groupId;
        if (createdId) setPendingSelectId(createdId);
      } else {
        setCreateError(data.error || 'Could not create that circle');
      }
    } catch (e) {
      setCreateError(errMessage(e) || 'Could not create that circle');
    }
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup || !editName.trim()) return;
    try {
      const res = await apiFetch(`/api/groups/${selectedGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        setIsEditing(false);
        onRefreshGroups();
      }
    } catch (e) {
      console.error('Failed to update group', e);
    }
  };

  const handleAddMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      const res = await apiFetch(`/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        setShowAddMember(false);
        onRefreshGroups();
      }
    } catch (e) {
      console.error('Failed to add member', e);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      const res = await apiFetch(`/api/groups/${selectedGroup.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefreshGroups();
      }
    } catch (e) {
      console.error('Failed to remove member', e);
    }
  };

  const executeDeleteCircle = async () => {
    if (!selectedGroup) return;
    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await apiFetch(`/api/groups/${selectedGroup.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete circle');
        return;
      }

      const deletedId = selectedGroup.id;
      setShowDeleteModal(false);

      if (onGroupDeleted) {
        onGroupDeleted(deletedId);
      }
      onRefreshGroups();

      // Pick next available group
      const remaining = groups.filter((g) => g.id !== deletedId);
      setSelectedGroup(remaining[0] || null);
    } catch (err) {
      setDeleteError(errMessage(err) || 'Network error while deleting circle');
    } finally {
      setDeleteLoading(false);
    }
  };

  const executeLeaveCircle = async () => {
    if (!selectedGroup || !user) return;
    setLeaveLoading(true);

    try {
      const res = await apiFetch(`/api/groups/${selectedGroup.id}/members/${user.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setShowLeaveModal(false);
        if (onGroupDeleted) {
          onGroupDeleted(selectedGroup.id);
        }
        onRefreshGroups();
        const remaining = groups.filter((g) => g.id !== selectedGroup.id);
        setSelectedGroup(remaining[0] || null);
      }
    } catch (e) {
      console.error('Failed to leave circle', e);
    } finally {
      setLeaveLoading(false);
    }
  };

  const canManageCurrentGroup = Boolean(
    selectedGroup &&
      !selectedGroup.isEveryone &&
      (isAdmin || selectedGroup.canManage || selectedGroup.creatorId === user?.id)
  );

  if (showCreateModal) {
    return (
      <div
        className="scrim z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeCreateSheet();
        }}
      >
        <div className="modal-panel max-w-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="eyebrow text-[0.62rem]">New circle</p>
              <h4 className="mt-0.5 font-display font-bold text-sm text-[var(--text-primary)]">
                Create Private Circle
              </h4>
            </div>
            <button
              type="button"
              onClick={closeCreateSheet}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateGroup} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Circle Name
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. College Buddies, Hiking Trip"
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Short description..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Add Friends
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)]">
                {availableUsers.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)] p-1">
                    No other members yet. You can create the circle now and add members later!
                  </p>
                ) : (
                  availableUsers.map((u) => {
                    const selected = selectedUserIds.includes(u.id);
                    const uName = u.displayName || u.display_name || u.username;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUserIds((prev) =>
                            prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                          );
                        }}
                        className={`px-2.5 py-1 text-[11px] rounded-lg transition font-medium ${
                          selected
                            ? 'bg-[var(--accent-coral)] text-white shadow-xs'
                            : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {uName}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {createError && (
              <p className="tone-rose rounded-xl border p-2 text-[11px] font-semibold">
                {createError}
              </p>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateSheet}
                className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[var(--accent-coral)] text-white playful-btn shadow-md"
              >
                Create Circle
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="scrim z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-[86dvh] max-h-[90dvh] sm:h-[80vh] sm:max-w-2xl w-full flex-col overflow-hidden rounded-[22px] sm:rounded-[26px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="px-4 py-3.5 sm:p-4 border-b border-[var(--border-color)] flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="w-5 h-5 shrink-0 text-[var(--accent-coral)]" />
            <h3 className="truncate font-display font-bold text-base text-[var(--text-primary)]">
              Your Circles
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-[var(--accent-coral)] text-white text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 playful-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Circle</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Responsive Split: horizontal circle strip on mobile, 2-column sidebar on sm+ */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Circles Sidebar / Mobile Strip */}
          <div className="w-full sm:w-1/3 shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--border-color)] overflow-x-auto sm:overflow-y-auto p-2 flex sm:flex-col gap-1.5 sm:gap-1 sm:space-y-0 scroll-x">
            {groups.map((g) => {
              const active = selectedGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedGroup(g);
                    setIsEditing(false);
                    setShowAddMember(false);
                  }}
                  className={`shrink-0 sm:w-full min-w-[132px] sm:min-w-0 text-left p-2.5 rounded-xl text-xs transition flex flex-col ${
                    active
                      ? 'bg-[var(--bg-surface-elevated)] border border-[var(--accent-coral)]/40 font-semibold text-[var(--text-primary)]'
                      : 'bg-[var(--bg-surface)]/40 sm:bg-transparent hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{g.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {g.isEveryone ? (
                        <span className="tone-amber text-[9px] border font-mono px-1 rounded">ALL</span>
                      ) : (
                        (isAdmin || g.canManage || g.creatorId === user?.id) && (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGroup(g);
                              setDeleteError(null);
                              setShowDeleteModal(true);
                            }}
                            title={`Delete ${g.name}`}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--tone-rose-fg)] hover:bg-[var(--tone-rose-bg)] rounded transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {g.members?.length || g.memberCount} members
                  </span>
                </button>
              );
            })}
          </div>

          {/* Circle Detail */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {selectedGroup ? (
              <div className="space-y-5">
                {/* Circle Meta */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2 py-1 text-xs rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] w-full"
                        />
                        <input
                          type="text"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Description..."
                          className="px-2 py-1 text-xs rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] w-full"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleUpdateGroup}
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-xs flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-display font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                          <span>{selectedGroup.name}</span>
                          {selectedGroup.isEveryone && (
                            <span className="tone-emerald text-[9px] border font-mono px-1.5 py-0.5 rounded font-semibold">
                              Default Everyone
                            </span>
                          )}
                        </h4>
                        {selectedGroup.description && (
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {selectedGroup.description}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {onSelectGroupFeed && (
                      <button
                        onClick={() => {
                          onSelectGroupFeed(selectedGroup.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] transition"
                      >
                        View Feed
                      </button>
                    )}

                    {canManageCurrentGroup && !isEditing && (
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setEditName(selectedGroup.name);
                          setEditDesc(selectedGroup.description || '');
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                        title="Edit circle name & description"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Circle Button (Creator or Admin) */}
                    {canManageCurrentGroup && (
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setShowDeleteModal(true);
                        }}
                        className="tone-rose px-2.5 py-1 text-xs rounded-xl border hover:bg-rose-600 hover:text-white hover:border-rose-600 transition flex items-center gap-1 font-semibold"
                        title="Delete Circle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Circle</span>
                      </button>
                    )}

                    {/* Leave Circle Button (for non-creator member in non-Everyone circle) */}
                    {!selectedGroup.isEveryone && !canManageCurrentGroup && (
                      <button
                        onClick={() => setShowLeaveModal(true)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--tone-rose-fg)] hover:bg-[var(--tone-rose-bg)] transition"
                        title="Leave Circle"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Members List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                      Members ({selectedGroup.members?.length || 0})
                    </span>

                    {canManageCurrentGroup && (
                      <button
                        onClick={() => setShowAddMember((prev) => !prev)}
                        className="text-xs text-[var(--accent-coral)] font-semibold flex items-center gap-1 hover:underline"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add Member
                      </button>
                    )}
                  </div>

                  {/* Add member selector */}
                  {showAddMember && (
                    <div className="p-3 mb-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                      <span className="text-[11px] text-[var(--text-muted)] block mb-2 font-medium">
                        Select an approved friend to add to this circle:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableUsers
                          .filter((u) => !selectedGroup.members?.some((m) => m.id === u.id))
                          .map((u) => (
                            <button
                              key={u.id}
                              onClick={() => handleAddMember(u.id)}
                              className="px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-surface-elevated)] hover:bg-[var(--accent-coral)] hover:text-white transition"
                            >
                              + {u.display_name} (@{u.username})
                            </button>
                          ))}
                        {availableUsers.filter((u) => !selectedGroup.members?.some((m) => m.id === u.id)).length === 0 && (
                          <p className="text-[11px] text-[var(--text-muted)] py-1">
                            All approved members are already in this circle.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {selectedGroup.members?.map((member) => {
                      const mName = member.displayName || (member as any).display_name || member.username || 'Member';
                      const mInitial = mName.charAt(0).toUpperCase();
                      const mColor = member.avatarColor || (member as any).avatar_color || '#f59e0b';
                      const isMemberCreator = selectedGroup.creatorId === member.id;

                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)]"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={mName}
                              color={mColor}
                              src={member.avatarUrl}
                              size={24}
                              className="shadow-2xs"
                            />
                            <div>
                              <span className="font-semibold text-[var(--text-primary)] block">
                                {mName}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                @{member.username} {isMemberCreator && '• Circle Creator'}
                              </span>
                            </div>
                          </div>

                          {!selectedGroup.isEveryone && (member.id === user?.id || canManageCurrentGroup) && !isMemberCreator && (
                            <button
                              onClick={() => handleRemoveMember(member.id)}
                              className="text-xs text-[var(--text-muted)] hover:text-rose-400 p-1"
                              title={member.id === user?.id ? 'Leave Circle' : 'Remove from Circle'}
                            >
                              {member.id === user?.id ? <LogOut className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Select a circle to manage</p>
            )}
          </div>
        </div>

        {/* --- Delete Circle Confirmation Modal (In-App) --- */}
        {showDeleteModal && selectedGroup && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleteLoading) setShowDeleteModal(false);
            }}
          >
            <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
              <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Circle</span>
              </div>

              <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                <p>
                  Are you sure you want to delete circle <strong>"{selectedGroup.name}"</strong>?
                </p>
                <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                  Shared photos and memories will remain safely with their respective owners. Only this private circle and its membership channel will be removed.
                </p>
              </div>

              {deleteError && (
                <p className="tone-rose text-xs border p-2 rounded-lg font-medium">
                  {deleteError}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => setShowDeleteModal(false)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={executeDeleteCircle}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {deleteLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{deleteLoading ? 'Deleting...' : 'Yes, Delete Circle'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- Leave Circle Confirmation Modal --- */}
        {showLeaveModal && selectedGroup && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
            onClick={(e) => {
              if (e.target === e.currentTarget && !leaveLoading) setShowLeaveModal(false);
            }}
          >
            <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                <LogOut className="w-4 h-4" />
                <span>Leave Circle</span>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Are you sure you want to leave circle <strong>"{selectedGroup.name}"</strong>? You will no longer see updates from this circle.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={leaveLoading}
                  onClick={() => setShowLeaveModal(false)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={leaveLoading}
                  onClick={executeLeaveCircle}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {leaveLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{leaveLoading ? 'Leaving...' : 'Yes, Leave Circle'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
