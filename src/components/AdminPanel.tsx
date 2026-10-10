import React, { useState, useEffect } from 'react';
import {
  Shield,
  Check,
  X,
  Key,
  UserX,
  UserCheck,
  AlertTriangle,
  FileText,
  Clock,
  Copy,
  CheckCheck,
  Sparkles,
  CheckCircle2,
  Trash2,
  Users,
  RefreshCw,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { AuditLogItem } from '../types/index.ts';

export const AdminPanel: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'signups' | 'users' | 'circles' | 'proposals' | 'reports' | 'audit'>('signups');

  // If user is not an admin, do not render or fetch anything
  if (!isAdmin || user?.role !== 'admin') {
    return null;
  }

  const [pendingSignups, setPendingSignups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [circles, setCircles] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // In-app deletion states
  const [userToDelete, setUserToDelete] = useState<{ id: string; username: string; display_name: string } | null>(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  const [circleToDelete, setCircleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteCircleLoading, setDeleteCircleLoading] = useState(false);

  // Generated reset link modal
  const [generatedLink, setGeneratedLink] = useState<{ username: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ isTursoSynced: boolean; tursoConfigured: boolean; lastSync: string | null; error: string | null } | null>(null);

  const fetchDbStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/db-status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);

  const handlePurgeAllData = async () => {
    setPurgeLoading(true);
    try {
      const res = await apiFetch('/api/admin/purge-all-data', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionToast({
          message: data.message || 'All files permanently deleted from storage and feed cleared.',
          type: 'success',
        });
        setShowPurgeConfirm(false);
      } else {
        setActionToast({ message: data.error || 'Failed to purge data', type: 'error' });
      }
    } catch (e: any) {
      setActionToast({ message: e.message || 'Error purging data', type: 'error' });
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleSyncStorage = async () => {
    setSyncLoading(true);
    try {
      const res = await apiFetch('/api/admin/sync-storage', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.recovered > 0) {
          setActionToast({
            message: `Successfully restored ${data.recovered} photo(s) from storage into feed! (${data.totalFound} found in storage)`,
            type: 'success',
          });
        } else if (data.totalFound > 0) {
          setActionToast({
            message: `All ${data.totalFound} items in storage are already synced with feed.`,
            type: 'success',
          });
        } else {
          setActionToast({
            message: 'No media items found in storage bucket or folder.',
            type: 'success',
          });
        }
      } else {
        setActionToast({ message: data.error || 'Failed to sync storage', type: 'error' });
      }
    } catch (e: any) {
      setActionToast({ message: e.message || 'Error syncing storage', type: 'error' });
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (actionToast) {
      const timer = setTimeout(() => setActionToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionToast]);

  const fetchSignups = async () => {
    try {
      const res = await apiFetch('/api/admin/pending-signups');
      if (res.ok) {
        const data = await res.json();
        setPendingSignups(data.pending || []);
      }
    } catch (e) {}
  };

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {}
  };

  const fetchCircles = async () => {
    try {
      const res = await apiFetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setCircles(data.groups || []);
      }
    } catch (e) {}
  };

  const fetchProposals = async () => {
    try {
      const res = await apiFetch('/api/admin/pending-proposals');
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (e) {}
  };

  const fetchReports = async () => {
    try {
      const res = await apiFetch('/api/admin/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {}
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiFetch('/api/admin/audit-log');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab === 'signups') fetchSignups();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'circles') fetchCircles();
    if (activeTab === 'proposals') fetchProposals();
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleteUserLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userToDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionToast({ message: `User @${userToDelete.username} deleted permanently`, type: 'success' });
        setUserToDelete(null);
        fetchUsers();
        fetchSignups();
      } else {
        setActionToast({ message: data.error || 'Failed to delete user', type: 'error' });
      }
    } catch (e: any) {
      setActionToast({ message: e.message || 'Failed to delete user', type: 'error' });
    } finally {
      setDeleteUserLoading(false);
    }
  };

  const handleDeleteCircle = async () => {
    if (!circleToDelete) return;
    setDeleteCircleLoading(true);
    try {
      const res = await apiFetch(`/api/groups/${circleToDelete.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionToast({ message: `Circle "${circleToDelete.name}" deleted permanently`, type: 'success' });
        setCircleToDelete(null);
        fetchCircles();
      } else {
        setActionToast({ message: data.error || 'Failed to delete circle', type: 'error' });
      }
    } catch (e: any) {
      setActionToast({ message: e.message || 'Failed to delete circle', type: 'error' });
    } finally {
      setDeleteCircleLoading(false);
    }
  };

  const handleApproveUser = async (userId: string, username?: string) => {
    try {
      const res = await apiFetch(`/api/admin/approve-user/${userId}`, { method: 'POST' });
      if (res.ok) {
        setActionToast({
          message: username
            ? `Account @${username} approved permanently! They can now log in freely without ever needing approval again.`
            : 'Account approved permanently! User can now log in without needing approval again.',
          type: 'success',
        });
        fetchSignups();
        fetchUsers();
      } else {
        const data = await res.json();
        setActionToast({ message: data.error || 'Failed to approve account', type: 'error' });
      }
    } catch (e: any) {
      setActionToast({ message: e.message || 'Failed to approve account', type: 'error' });
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/admin/reject-user/${userId}`, { method: 'POST' });
      if (res.ok) {
        setActionToast({ message: 'User signup rejected', type: 'success' });
        fetchSignups();
        fetchUsers();
      }
    } catch (e) {}
  };

  const handleToggleSuspend = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/admin/toggle-suspend/${userId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActionToast({
          message: data.status === 'active' ? 'Account activated!' : 'Account suspended',
          type: 'success',
        });
        fetchUsers();
      }
    } catch (e) {}
  };

  const handleGenerateReset = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/admin/generate-reset-link/${userId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLink({ username: data.username, link: data.resetUrl });
        setCopied(false);
      }
    } catch (e) {}
  };

  const handleProposalDecision = async (proposalId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await apiFetch(`/api/admin/proposals/${proposalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        fetchProposals();
      }
    } catch (e) {}
  };

  const handleReportDecision = async (reportId: string, status: string) => {
    try {
      const res = await apiFetch(`/api/admin/reports/${reportId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchReports();
      }
    } catch (e) {}
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      {/* Admin Title & Actions */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 flex-wrap">
          <Shield className="w-5 h-5 text-amber-500" />
          <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">
            Admin Portal
          </h2>
          {dbStatus && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1.5 transition ${
                dbStatus.isTursoSynced
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : dbStatus.tursoConfigured
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-400'
              }`}
              title={
                dbStatus.isTursoSynced
                  ? `Turso Cloud Database synced! Last cloud sync: ${dbStatus.lastSync ? new Date(dbStatus.lastSync).toLocaleTimeString() : 'Active'}`
                  : dbStatus.tursoConfigured
                  ? `Turso notice: ${dbStatus.error || 'Initializing cloud connection'}`
                  : 'Running on local SQLite database'
              }
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dbStatus.isTursoSynced ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{dbStatus.isTursoSynced ? 'Turso Cloud Synced' : dbStatus.tursoConfigured ? 'Turso Connecting...' : 'Local SQLite'}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncStorage}
            disabled={syncLoading || purgeLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-xl text-xs font-semibold transition border border-amber-500/20 disabled:opacity-50 cursor-pointer"
            title="Scan Backblaze B2 / local storage and restore past uploaded photos into feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
            {syncLoading ? 'Syncing...' : 'Sync Storage'}
          </button>
          <button
            onClick={() => setShowPurgeConfirm(true)}
            disabled={syncLoading || purgeLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition border border-rose-500/20 disabled:opacity-50 cursor-pointer"
            title="Permanently delete all files from Backblaze B2/storage and clear all posts"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Wipe Storage Bucket
          </button>
        </div>
      </div>

      {/* Action Feedback Toast */}
      {actionToast && (
        <div
          className={`p-3 rounded-2xl flex items-center justify-between gap-2 text-xs transition animate-in fade-in duration-200 ${
            actionToast.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{actionToast.message}</span>
          </div>
          <button
            onClick={() => setActionToast(null)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-2xl overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('signups')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'signups'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Pending Signups ({pendingSignups.length})
        </button>

        <button
          onClick={() => setActiveTab('proposals')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'proposals'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Proposals ({proposals.length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'users'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          User Directory ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('circles')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'circles'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Circles ({circles.length})
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'reports'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Reports ({reports.filter((r) => r.status === 'pending').length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            activeTab === 'audit'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Audit Log
        </button>
      </div>

      {/* Tab 1: Pending Signups */}
      {activeTab === 'signups' && (
        <div className="space-y-3">
          {pendingSignups.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
              No pending registrations. All friends are approved!
            </div>
          ) : (
            pendingSignups.map((u) => (
              <div
                key={u.id}
                className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs playful-card"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs"
                    style={{ backgroundColor: u.avatar_color }}
                  >
                    {u.display_name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-bold text-[var(--text-primary)] block">
                      {u.display_name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">
                      @{u.username} • Signed up {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveUser(u.id, u.username)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition playful-btn shadow-xs"
                    title="Approve this account permanently"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Approve Once
                  </button>
                  <button
                    onClick={() => handleRejectUser(u.id)}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-rose-900/40 text-rose-400 font-semibold flex items-center gap-1 transition"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Proposals */}
      {activeTab === 'proposals' && (
        <div className="space-y-3">
          {proposals.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
              No pending event proposals from members.
            </div>
          ) : (
            proposals.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start justify-between gap-3 text-xs playful-card"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-amber-500 font-semibold uppercase">
                      Event Proposal
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Proposed by @{p.creator_username}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">{p.title}</h4>
                  {p.description && <p className="text-xs text-[var(--text-secondary)] mt-1">{p.description}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleProposalDecision(p.id, 'approved')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 transition playful-btn"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleProposalDecision(p.id, 'rejected')}
                    className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-rose-900/40 text-rose-400 font-semibold flex items-center gap-1 transition"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Users */}
      {activeTab === 'users' && (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs playful-card"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-2xs"
                  style={{ backgroundColor: u.avatar_color }}
                >
                  {u.display_name.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-[var(--text-primary)]">{u.display_name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">@{u.username}</span>

                    {u.role === 'admin' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-bold font-mono">
                        Admin
                      </span>
                    )}

                    {u.role === 'member' && u.status === 'active' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold font-mono flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[2.5]" /> Approved Member
                      </span>
                    )}

                    {u.role === 'pending' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold font-mono flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> Pending Approval
                      </span>
                    )}

                    {u.status === 'suspended' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold font-mono">
                        Suspended
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* One-click Approve for any user in User Directory who is pending */}
                {u.role === 'pending' && (
                  <button
                    onClick={() => handleApproveUser(u.id, u.username)}
                    className="px-2.5 py-1 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 transition playful-btn shadow-xs"
                    title="Approve this account permanently"
                  >
                    <Check className="w-3 h-3 stroke-[2.5]" /> Approve Account
                  </button>
                )}

                <button
                  onClick={() => handleGenerateReset(u.id)}
                  title="Generate 1-time Password Reset Link"
                  className="px-2.5 py-1 text-xs rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition flex items-center gap-1"
                >
                  <Key className="w-3 h-3 text-amber-400" />
                  <span>Reset Link</span>
                </button>

                {u.role !== 'admin' && (
                  <button
                    onClick={() => handleToggleSuspend(u.id)}
                    className={`px-2.5 py-1 text-xs rounded-xl transition flex items-center gap-1 ${
                      u.status === 'active'
                        ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {u.status === 'active' ? (
                      <>
                        <UserX className="w-3 h-3" /> Suspend
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3 h-3" /> Activate
                      </>
                    )}
                  </button>
                )}

                {/* Delete User Button (Any user other than yourself) */}
                {u.id !== user?.id && (
                  <button
                    onClick={() => setUserToDelete(u)}
                    title={`Permanently delete user @${u.username}`}
                    className="px-2.5 py-1 text-xs rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white transition flex items-center gap-1 font-semibold"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Circles Management */}
      {activeTab === 'circles' && (
        <div className="space-y-3">
          {circles.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
              No circles found.
            </div>
          ) : (
            circles.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs playful-card"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)] text-sm">{c.name}</span>
                    {c.isEveryone ? (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono">
                        Everyone (Default)
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold font-mono">
                        Custom Circle
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{c.description}</p>
                  )}
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    {c.memberCount || c.members?.length || 0} members
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!c.isEveryone && (
                    <button
                      onClick={() => setCircleToDelete(c)}
                      title={`Permanently delete circle "${c.name}"`}
                      className="px-3 py-1.5 text-xs rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white transition flex items-center gap-1.5 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Circle</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 4: Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
              No content reports submitted.
            </div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Report ({r.target_type})
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">{r.status}</span>
                </div>
                <p className="text-[var(--text-primary)]">Reason: "{r.reason}"</p>
                <div className="flex justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                  {r.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleReportDecision(r.id, 'resolved')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px]"
                      >
                        Mark Resolved
                      </button>
                      <button
                        onClick={() => handleReportDecision(r.id, 'dismissed')}
                        className="px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-400 text-[11px]"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 5: Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)] flex items-start justify-between gap-3 font-mono"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--accent-coral)]">{log.action}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">by @{log.actor_username || 'system'}</span>
                </div>
                <p className="text-[var(--text-secondary)] mt-0.5">{log.details}</p>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Generated Reset Link Modal */}
      {generatedLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl playful-card">
            <h4 className="font-display font-bold text-sm text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-500" />
              One-Time Password Reset Link
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
              Send this single-use link to <strong>@{generatedLink.username}</strong>. It expires in 24 hours and can only be used once.
            </p>

            <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] font-mono text-xs text-[var(--accent-amber)] break-all select-all mb-4">
              {generatedLink.link}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent-amber)] text-black flex items-center gap-1.5 playful-btn"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
              </button>

              <button
                onClick={() => setGeneratedLink(null)}
                className="px-4 py-2 text-xs text-[var(--text-secondary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteUserLoading) setUserToDelete(null);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl space-y-4 playful-card">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Delete User Account</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Are you sure you want to permanently delete user <strong>@{userToDelete.username}</strong> ({userToDelete.display_name})?
              </p>
              <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                This will completely remove this user's account, their uploaded memories, posts, memberships, and active sessions. This action cannot be undone.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleteUserLoading}
                onClick={() => setUserToDelete(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteUserLoading}
                onClick={handleDeleteUser}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {deleteUserLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleteUserLoading ? 'Deleting...' : 'Yes, Delete User'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Circle Confirmation Modal */}
      {circleToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteCircleLoading) setCircleToDelete(null);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl space-y-4 playful-card">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Delete Circle</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Are you sure you want to permanently delete circle <strong>"{circleToDelete.name}"</strong>?
              </p>
              <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                Shared memories will remain safe with their owners. Only this circle channel and its membership will be removed.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleteCircleLoading}
                onClick={() => setCircleToDelete(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteCircleLoading}
                onClick={handleDeleteCircle}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {deleteCircleLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleteCircleLoading ? 'Deleting...' : 'Yes, Delete Circle'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Storage & Feed Confirmation Modal */}
      {showPurgeConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget && !purgeLoading) setShowPurgeConfirm(false);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-rose-500/30 rounded-3xl shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Wipe Storage Bucket & Feed</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Are you sure you want to <strong>permanently delete all past files from your storage bucket</strong> and clear all posts and collections?
              </p>
              <p className="text-[11px] text-rose-300 bg-rose-950/40 p-2.5 rounded-xl border border-rose-500/30">
                This will delete every uploaded photo/video from Backblaze B2 and reset feed data so you can start with a completely clean slate.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={purgeLoading}
                onClick={() => setShowPurgeConfirm(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgeLoading}
                onClick={handlePurgeAllData}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {purgeLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{purgeLoading ? 'Purging Bucket...' : 'Yes, Wipe Everything'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
