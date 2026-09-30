import React, { useState, useEffect } from 'react';
import { X, Users, Plus, UserPlus, LogOut, Trash2, Edit3, Check } from 'lucide-react';
import { Group, GroupMember } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onRefreshGroups: () => void;
  onSelectGroupFeed?: (groupId: string | undefined) => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  isOpen,
  onClose,
  groups,
  onRefreshGroups,
  onSelectGroupFeed,
}) => {
  const { user, isAdmin } = useAuth();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);

  const fetchAvailableUsers = async () => {
    try {
      const res = await fetch('/api/groups/available-users');
      if (res.ok) {
        const data = await res.json();
        setAvailableUsers(data.users || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen) {
      fetchAvailableUsers();
      if (!selectedGroup && groups.length > 0) {
        setSelectedGroup(groups[0]);
      }
    }
  }, [isOpen, groups]);

  if (!isOpen) return null;

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          memberIds: selectedUserIds,
        }),
      });

      if (res.ok) {
        setNewGroupName('');
        setNewGroupDesc('');
        setSelectedUserIds([]);
        setShowCreateModal(false);
        onRefreshGroups();
      }
    } catch (e) {}
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup || !editName.trim()) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
      });
      if (res.ok) {
        setIsEditing(false);
        onRefreshGroups();
      }
    } catch (e) {}
  };

  const handleAddMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        setShowAddMember(false);
        onRefreshGroups();
      }
    } catch (e) {}
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefreshGroups();
      }
    } catch (e) {}
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Delete circle "${selectedGroup.name}"? Shared memories will stay with their respective owners.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefreshGroups();
        setSelectedGroup(groups[0] || null);
      }
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl flex flex-col max-h-[88vh] h-[80vh] playful-card overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[var(--accent-coral)]" />
            <h3 className="font-display font-bold text-base text-[var(--text-primary)]">
              Your Circles
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
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

        {/* 2-Column Split: Circles List on left, Selected Circle detail on right */}
        <div className="flex-1 flex overflow-hidden">
          {/* Circles Sidebar */}
          <div className="w-1/3 border-r border-[var(--border-color)] overflow-y-auto p-2 space-y-1">
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
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition flex flex-col ${
                    active
                      ? 'bg-[var(--bg-surface-elevated)] border border-[var(--accent-coral)]/40 font-semibold text-[var(--text-primary)]'
                      : 'hover:bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{g.name}</span>
                    {g.isEveryone && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-500 font-mono px-1 rounded">ALL</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {g.members?.length || g.memberCount} members
                  </span>
                </button>
              );
            })}
          </div>

          {/* Circle Detail */}
          <div className="flex-1 overflow-y-auto p-5">
            {selectedGroup ? (
              <div className="space-y-5">
                {/* Circle Meta */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-2 py-1 text-xs rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
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
                            className="px-2 py-1 bg-neutral-700 text-white rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="font-display font-bold text-base text-[var(--text-primary)]">
                          {selectedGroup.name}
                        </h4>
                        {selectedGroup.description && (
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {selectedGroup.description}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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

                    {selectedGroup.canManage && !selectedGroup.isEveryone && !isEditing && (
                      <button
                        onClick={() => {
                          setIsEditing(true);
                          setEditName(selectedGroup.name);
                          setEditDesc(selectedGroup.description || '');
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}

                    {selectedGroup.canManage && !selectedGroup.isEveryone && (
                      <button
                        onClick={handleDeleteGroup}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10"
                        title="Delete Group"
                      >
                        <Trash2 className="w-4 h-4" />
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

                    {selectedGroup.canManage && !selectedGroup.isEveryone && (
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
                        Select an approved friend to add:
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
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {selectedGroup.members?.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)]"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: member.avatarColor }}
                          >
                            {member.displayName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-[var(--text-primary)] block">
                              {member.displayName}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              @{member.username} {selectedGroup.creatorId === member.id && '• Creator'}
                            </span>
                          </div>
                        </div>

                        {!selectedGroup.isEveryone && (member.id === user?.id || selectedGroup.canManage) && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-xs text-[var(--text-muted)] hover:text-rose-400 p-1"
                            title={member.id === user?.id ? 'Leave Circle' : 'Remove from Circle'}
                          >
                            {member.id === user?.id ? <LogOut className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Select a circle to manage</p>
            )}
          </div>
        </div>

        {/* Create Group Sub-Modal */}
        {showCreateModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl playful-card">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-display font-bold text-sm text-[var(--text-primary)]">
                  Create Private Circle
                </h4>
                <button onClick={() => setShowCreateModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
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
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Book Club, Roommates"
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Short description..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Add Friends
                  </label>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 bg-[var(--bg-surface)] rounded-xl">
                    {availableUsers.map((u) => {
                      const selected = selectedUserIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedUserIds((prev) =>
                              prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                            );
                          }}
                          className={`px-2 py-1 text-[11px] rounded-lg transition ${
                            selected
                              ? 'bg-[var(--accent-coral)] text-white'
                              : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-white'
                          }`}
                        >
                          {u.display_name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-[var(--accent-coral)] text-white playful-btn"
                  >
                    Create Circle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
