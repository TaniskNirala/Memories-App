import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Users,
  Globe,
  Lock,
  Check,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { FeedItem, Group } from '../types/index.ts';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';

interface ViewingPermissionsModalProps {
  item: FeedItem | null;
  isOpen: boolean;
  onClose: () => void;
  groups: Group[];
  onPermissionsUpdated?: (updatedPlacements?: any[], visibilityOverride?: string | null) => void;
}

export const ViewingPermissionsModal: React.FC<ViewingPermissionsModalProps> = ({
  item,
  isOpen,
  onClose,
  groups,
  onPermissionsUpdated,
}) => {
  const { user, isAdmin } = useAuth();
  const [availableGroups, setAvailableGroups] = useState<Group[]>(groups || []);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [visibilityOverride, setVisibilityOverride] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (groups && groups.length > 0) {
      setAvailableGroups(groups);
    } else if (isOpen) {
      apiFetch('/api/groups')
        .then((r) => r.json())
        .then((data) => {
          if (data.groups) setAvailableGroups(data.groups);
        })
        .catch(() => {});
    }
  }, [groups, isOpen]);

  // Initialize permissions when modal opens
  useEffect(() => {
    if (!isOpen || !item) return;

    setToast(null);
    setLoading(true);

    const itemType = item.type === 'single_post' ? 'post' : 'album';

    apiFetch(`/api/placements/item/${itemType}/${item.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.placements && Array.isArray(data.placements)) {
          setSelectedGroupIds(data.placements.map((p: any) => p.group_id));
        } else if (item.placements && Array.isArray(item.placements)) {
          setSelectedGroupIds(item.placements.map((p) => p.groupId));
        }
        setVisibilityOverride(data.visibilityOverride || (item as any).visibilityOverride || null);
      })
      .catch((err) => {
        console.error('Failed to load item permissions:', err);
        // Fallback to item.placements
        if (item.placements && Array.isArray(item.placements)) {
          setSelectedGroupIds(item.placements.map((p) => p.groupId));
        }
        setVisibilityOverride((item as any).visibilityOverride || null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const isOwner =
    item.type === 'single_post'
      ? item.owner?.id === user?.id
      : (item as any).creator?.id === user?.id || (item as any).owner?.id === user?.id;

  const canManage = isOwner || isAdmin;

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSelectEveryone = () => {
    const everyoneGroup = availableGroups.find((g) => g.isEveryone);
    if (everyoneGroup) {
      if (selectedGroupIds.includes(everyoneGroup.id)) {
        // Toggle off
        setSelectedGroupIds((prev) => prev.filter((id) => id !== everyoneGroup.id));
      } else {
        // Add everyone
        setSelectedGroupIds((prev) => [...prev, everyoneGroup.id]);
      }
    } else {
      // Select all groups
      setSelectedGroupIds(availableGroups.map((g) => g.id));
    }
  };

  const handleSelectAllCircles = () => {
    if (selectedGroupIds.length === availableGroups.length && availableGroups.length > 0) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(availableGroups.map((g) => g.id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    const itemType = item.type === 'single_post' ? 'post' : 'album';

    try {
      const res = await apiFetch('/api/placements/adjust-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          itemType,
          targetGroupIds: selectedGroupIds,
          visibilityOverride: item.type === 'single_post' ? visibilityOverride : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setToast({ message: 'Viewing permissions updated successfully!', type: 'success' });

        // Update local item placements representation
        if (item.placements && Array.isArray(data.placements)) {
          item.placements = data.placements.map((p: any) => ({
            id: p.id,
            groupId: p.group_id,
            groupName: p.group_name,
            isReference: Boolean(p.is_reference),
            referenceStatus: p.reference_status,
          }));
        }
        if (item.type === 'single_post') {
          (item as any).visibilityOverride = visibilityOverride;
        }

        if (onPermissionsUpdated) {
          onPermissionsUpdated(data.placements, visibilityOverride);
        }

        setTimeout(() => {
          onClose();
        }, 1100);
      } else {
        setToast({ message: data.error || 'Failed to update permissions', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Network error saving permissions', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const everyoneGroup = availableGroups.find((g) => g.isEveryone);
  const isEveryoneSelected = everyoneGroup ? selectedGroupIds.includes(everyoneGroup.id) : false;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#16162a] border border-[#2b2b52] rounded-3xl shadow-2xl p-5 text-white playful-card relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2b2b52]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center shadow-xs">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                Viewing Permissions
              </h3>
              <p className="text-[11px] text-neutral-400">
                Control which friend circles can see this memory
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Toast */}
        {toast && (
          <div
            className={`mt-3 p-2.5 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
              toast.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Active Audience Summary */}
          <div className="p-3 rounded-2xl bg-[#1e1e38] border border-[#2b2b52] text-xs space-y-1">
            <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider block">
              Current Audience
            </span>
            <div className="flex items-center justify-between text-neutral-200">
              <span>
                {selectedGroupIds.length === 0
                  ? '🔒 Private (Visible to creator and admins only)'
                  : isEveryoneSelected
                  ? '🌐 Visible to Everyone (All Approved Members)'
                  : `👥 Visible to ${selectedGroupIds.length} circle(s)`}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-neutral-300 font-mono">
                {selectedGroupIds.length} / {availableGroups.length} circles
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider block mb-1.5">
              Quick Audience Presets
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectEveryone}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  isEveryoneSelected
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                    : 'bg-[#1e1e38] border-[#2b2b52] text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="block font-semibold">Everyone Circle</span>
                  <span className="text-[10px] text-neutral-400 block">All close friends</span>
                </div>
              </button>

              <button
                type="button"
                onClick={handleSelectAllCircles}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition ${
                  selectedGroupIds.length === availableGroups.length && availableGroups.length > 0
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                    : 'bg-[#1e1e38] border-[#2b2b52] text-neutral-300 hover:border-neutral-500'
                }`}
              >
                <Users className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="block font-semibold">All Circles</span>
                  <span className="text-[10px] text-neutral-400 block">Select all groups</span>
                </div>
              </button>
            </div>
          </div>

          {/* Circle Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                Select Circles with Viewing Permission
              </span>
              <span className="text-[10px] text-neutral-400">
                Checked circles can view
              </span>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto p-1 bg-[#1e1e38] border border-[#2b2b52] rounded-2xl">
              {availableGroups.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-400">
                  No friend circles found.
                </div>
              ) : (
                availableGroups.map((g) => {
                  const isChecked = selectedGroupIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      onClick={() => toggleGroup(g.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition select-none ${
                        isChecked
                          ? 'bg-sky-500/15 border border-sky-500/30 text-white font-medium'
                          : 'bg-[#16162a]/60 hover:bg-[#16162a] text-neutral-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                            isChecked
                              ? 'bg-sky-500 text-white'
                              : 'bg-white/10 text-neutral-400'
                          }`}
                        >
                          {isChecked ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{g.name}</span>
                            {g.isEveryone ? (
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold">
                                Auto
                              </span>
                            ) : null}
                          </div>
                          {g.description && (
                            <p className="text-[10px] text-neutral-400 line-clamp-1">
                              {g.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="text-[10px] font-mono text-neutral-400">
                        {isChecked ? (
                          <span className="text-sky-400 font-semibold">Can View</span>
                        ) : (
                          <span>Hidden</span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Visibility Override (for Admins or Owner) */}
          {item.type === 'single_post' && (isAdmin || isOwner) && (
            <div className="p-3 rounded-2xl bg-[#1e1e38] border border-[#2b2b52] space-y-2">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-bold text-neutral-200">
                  Special Visibility Overrides
                </span>
                {isAdmin && (
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold ml-auto">
                    Admin Tool
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setVisibilityOverride(null)}
                  className={`py-1.5 px-2 rounded-xl text-center transition border ${
                    visibilityOverride === null
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                      : 'bg-white/5 border-transparent text-neutral-400 hover:text-white'
                  }`}
                >
                  Standard Circles
                </button>

                <button
                  type="button"
                  onClick={() => setVisibilityOverride('public_all')}
                  className={`py-1.5 px-2 rounded-xl text-center transition border ${
                    visibilityOverride === 'public_all'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-semibold'
                      : 'bg-white/5 border-transparent text-neutral-400 hover:text-white'
                  }`}
                  title="Make visible to all members regardless of circle"
                >
                  Force Public
                </button>

                <button
                  type="button"
                  onClick={() => setVisibilityOverride('hidden')}
                  className={`py-1.5 px-2 rounded-xl text-center transition border ${
                    visibilityOverride === 'hidden'
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-semibold'
                      : 'bg-white/5 border-transparent text-neutral-400 hover:text-white'
                  }`}
                  title="Hide from all circle feeds"
                >
                  Hide / Lock
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-3 border-t border-[#2b2b52] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-amber-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-lg shadow-sky-500/20 disabled:opacity-50 playful-btn"
          >
            {saving ? (
              <span>Saving Permissions...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Save Permissions</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
