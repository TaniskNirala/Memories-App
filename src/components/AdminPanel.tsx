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
  Database,
  Download,
  HardDrive,
} from 'lucide-react';
import { useAuth, apiFetch } from '../context/AuthContext.tsx';
import { AuditLogItem } from '../types/index.ts';
import { StorageCapabilitiesResponse } from '../utils/uploadWithProgress.ts';
import { Avatar, PageHero, StatTile } from './ui/kit.tsx';
import { errMessage } from '../lib/errors.ts';

// Wrapper does the admin check so the hooks in AdminPanelInner are never
// skipped conditionally (React error #310).
export const AdminPanel: React.FC = () => {
  const { user, isAdmin } = useAuth();
  // If user is not an admin, do not render or fetch anything
  if (!isAdmin || user?.role !== 'admin') {
    return null;
  }
  return <AdminPanelInner />;
};

const AdminPanelInner: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'signups' | 'users' | 'circles' | 'proposals' | 'reports' | 'audit'>('signups');

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
  const [generatedLink, setGeneratedLink] = useState<{ username: string; link: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [showClearFeedConfirm, setShowClearFeedConfirm] = useState(false);
  const [clearFeedLoading, setClearFeedLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    isTursoSynced: boolean;
    tursoConfigured: boolean;
    lastSync: string | null;
    error: string | null;
    tursoUrl?: string | null;
    userCount?: number;
    postCount?: number;
    albumCount?: number;
  } | null>(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbSyncLoading, setDbSyncLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Read-only Storage diagnostics state (credentials are strictly server env-only)
  const [storageStatus, setStorageStatus] = useState<
    (StorageCapabilitiesResponse & { telegramFileCount: number; legacyFileCount: number }) | null
  >(null);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [storageTestLoading, setStorageTestLoading] = useState(false);
  const [storageTestResult, setStorageTestResult] = useState<{
    ok: boolean;
    summary: string;
    lanes?: {
      botApi?: { enabled: boolean; ok: boolean; botUsername?: string; channelTitle?: string; customServer?: boolean; error?: string };
      mtproto?: { enabled: boolean; mode: 'embedded' | 'external'; ok: boolean; connected?: boolean; channelTitle?: string; error?: string };
      b2Fallback?: { enabled: boolean; ok: boolean; objectCount?: number; error?: string };
    };
  } | null>(null);

  const fetchDbStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/db-status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
      }
    } catch (err) {
      console.error('Load database status failed', err);
    }
  };

  const fetchStorageStatus = async () => {
    try {
      const res = await apiFetch('/api/admin/storage-status');
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data);
      }
    } catch (err) {
      console.error('Load storage status failed', err);
    }
  };

  const handleTestStorageConnection = async () => {
    setStorageTestLoading(true);
    setStorageTestResult(null);
    try {
      const res = await apiFetch('/api/admin/storage-test', { method: 'POST' });
      const data = await res.json().catch(() => ({ ok: false, summary: 'Invalid server response' }));
      setStorageTestResult(data);
      if (data.ok) {
        setActionToast({ message: data.summary || 'Storage connection verified!', type: 'success' });
      } else {
        setActionToast({ message: data.summary || 'Storage connection check reported an issue', type: 'error' });
      }
      fetchStorageStatus();
    } catch (e) {
      const msg = errMessage(e) || 'Failed to test storage connection';
      setStorageTestResult({ ok: false, summary: msg });
      setActionToast({ message: msg, type: 'error' });
    } finally {
      setStorageTestLoading(false);
    }
  };

  const handleManualDbSync = async () => {
    setDbSyncLoading(true);
    try {
      const res = await apiFetch('/api/admin/db-sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setActionToast({ message: data.message || 'Successfully synced with Neon!', type: 'success' });
        fetchDbStatus();
      } else {
        setActionToast({ message: data.message || 'Neon sync notice updated', type: 'error' });
        fetchDbStatus();
      }
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Error syncing database', type: 'error' });
    } finally {
      setDbSyncLoading(false);
    }
  };

  const handleRestoreFromTurso = async () => {
    setRestoreLoading(true);
    try {
      const res = await apiFetch('/api/admin/restore-turso', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setActionToast({
          message: data.message || `Successfully restored ${data.totalRestored ?? 'all'} record(s) from Neon!`,
          type: 'success',
        });
        fetchDbStatus();
        fetchUsers();
        fetchCircles();
        fetchSignups();
      } else {
        setActionToast({ message: data.message || 'Failed to restore from Neon', type: 'error' });
        fetchDbStatus();
      }
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Error restoring from Neon', type: 'error' });
    } finally {
      setRestoreLoading(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    fetchStorageStatus();
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
        fetchDbStatus();
        fetchStorageStatus();
      } else {
        setActionToast({ message: data.error || 'Failed to purge data', type: 'error' });
      }
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Error purging data', type: 'error' });
    } finally {
      setPurgeLoading(false);
    }
  };

  const handleClearFeed = async () => {
    setClearFeedLoading(true);
    try {
      const res = await apiFetch('/api/admin/clear-feed', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionToast({
          message: data.message || 'All feed posts and collections cleared. Users and circles preserved.',
          type: 'success',
        });
        setShowClearFeedConfirm(false);
        fetchDbStatus();
        fetchStorageStatus();
      } else {
        setActionToast({ message: data.error || 'Failed to clear feed', type: 'error' });
      }
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Error clearing feed', type: 'error' });
    } finally {
      setClearFeedLoading(false);
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
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Error syncing storage', type: 'error' });
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
    } catch (err) {
      console.error('Load pending signups failed', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Load users failed', err);
    }
  };

  const fetchCircles = async () => {
    try {
      const res = await apiFetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setCircles(data.groups || []);
      }
    } catch (err) {
      console.error('Load circles failed', err);
    }
  };

  const fetchProposals = async () => {
    try {
      const res = await apiFetch('/api/admin/pending-proposals');
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (err) {
      console.error('Load proposals failed', err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await apiFetch('/api/admin/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error('Load reports failed', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiFetch('/api/admin/audit-log');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Load audit log failed', err);
    }
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
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Failed to delete user', type: 'error' });
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
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Failed to delete circle', type: 'error' });
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
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Failed to approve account', type: 'error' });
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
    } catch (err) {
      console.error('Reject user failed', err);
      setActionToast({ message: 'Could not reject the user.', type: 'error' });
    }
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
    } catch (err) {
      console.error('Toggle suspend failed', err);
      setActionToast({ message: 'Could not change suspension.', type: 'error' });
    }
  };

  const handleGenerateReset = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/admin/generate-reset-link/${userId}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        const link = origin ? `${origin}/#token=${data.token}` : data.resetUrl;
        setGeneratedLink({ username: data.username, link, token: data.token });
        setCopied(false);
        setCopiedToken(false);
      } else {
        setActionToast({ message: data.error || 'Failed to generate reset key', type: 'error' });
      }
    } catch (e) {
      setActionToast({ message: errMessage(e) || 'Failed to generate reset key', type: 'error' });
    }
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
    } catch (err) {
      console.error('Proposal decision failed', err);
      setActionToast({ message: 'Could not save the proposal decision.', type: 'error' });
    }
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
    } catch (err) {
      console.error('Report decision failed', err);
      setActionToast({ message: 'Could not save the report decision.', type: 'error' });
    }
  };

  const TABS: { id: typeof activeTab; label: string; count: () => number | undefined }[] = [
    { id: 'signups', label: 'Signups', count: () => pendingSignups.length },
    { id: 'proposals', label: 'Proposals', count: () => proposals.length },
    { id: 'users', label: 'People', count: () => users.length },
    { id: 'circles', label: 'Circles', count: () => circles.length },
    { id: 'reports', label: 'Reports', count: () => reports.filter((r) => r.status === 'pending').length },
    { id: 'audit', label: 'Audit log', count: () => undefined },
  ];

  return (
    <div className="w-full space-y-4">
      <PageHero
        eyebrow="Control room"
        title="Admin studio"
        subtitle="Approve people, moderate reports, manage circles and keep the database healthy."
        accent="amber"
        actions={
          <>
            <button
              type="button"
              onClick={handleSyncStorage}
              disabled={syncLoading || purgeLoading || clearFeedLoading}
              className="btn btn-soft btn-sm"
              title="Scan storage and restore uploaded photos into the feed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
              {syncLoading ? 'Scanning…' : 'Scan storage'}
            </button>
            <button
              type="button"
              onClick={() => setShowClearFeedConfirm(true)}
              disabled={syncLoading || purgeLoading || clearFeedLoading}
              className="btn btn-soft btn-sm"
              title="Clear all memories and collections from the feed"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear feed
            </button>
            <button
              type="button"
              onClick={() => setShowPurgeConfirm(true)}
              disabled={syncLoading || purgeLoading || clearFeedLoading}
              className="btn btn-danger btn-sm"
              title="Permanently delete all files and posts"
            >
              <Trash2 className="h-3.5 w-3.5" /> Wipe bucket
            </button>
          </>
        }
        aside={
          <div className="flex flex-col gap-1.5">
            {dbStatus && (
              <button
                type="button"
                onClick={() => setShowDbModal(true)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-2.5 py-1 text-[10px] font-medium transition hover:border-[var(--accent-amber)]/40"
                title="Neon database diagnostics & sync"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    dbStatus.isTursoSynced ? 'bg-emerald-400' : dbStatus.tursoConfigured ? 'bg-amber-400' : 'bg-neutral-400'
                  }`}
                />
                <Database className="h-3 w-3" />
                <span className="text-[var(--text-secondary)]">
                  {dbStatus.isTursoSynced ? 'Neon synced' : dbStatus.tursoConfigured ? 'Neon pending' : 'Local only'}
                </span>
              </button>
            )}
            {storageStatus && (
              <button
                type="button"
                onClick={() => {
                  setStorageTestResult(null);
                  setShowStorageModal(true);
                  fetchStorageStatus();
                }}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-2.5 py-1 text-[10px] font-medium transition hover:border-[var(--accent-amber)]/40"
                title="Media storage diagnostics & connection test"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    storageStatus.backend === 'telegram'
                      ? 'bg-sky-400'
                      : storageStatus.backend === 's3'
                        ? 'bg-emerald-400'
                        : 'bg-neutral-400'
                  }`}
                />
                <HardDrive className="h-3 w-3" />
                <span className="text-[var(--text-secondary)]">
                  {storageStatus.backend === 'telegram'
                    ? `Telegram · ${storageStatus.maxFileSizeLabel}`
                    : storageStatus.backend === 's3'
                      ? 'Backblaze B2'
                      : 'Local disk'}
                </span>
              </button>
            )}
          </div>
        }
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Awaiting you" value={pendingSignups.length} hint="signups to review" icon={<UserCheck className="h-4 w-4" />} />
        <StatTile label="Proposals" value={proposals.length} hint="albums suggested" tone="coral" icon={<Sparkles className="h-4 w-4" />} />
        <StatTile label="Open reports" value={reports.filter((r) => r.status === 'pending').length} hint="need a decision" tone="indigo" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatTile label="Members" value={users.length} hint="in the directory" tone="mint" icon={<Users className="h-4 w-4" />} />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 p-1">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          const count = t.count();
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.7)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] ${
                    active ? 'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
                className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar
                    name={u.display_name}
                    color={u.avatar_color}
                    src={u.avatarUrl}
                    size={32}
                    className="shadow-xs"
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-[var(--text-primary)] block truncate">
                      {u.display_name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-mono block truncate">
                      @{u.username} • Signed up {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <button
                    onClick={() => handleApproveUser(u.id, u.username)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition playful-btn shadow-xs"
                    title="Approve this account permanently"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Approve Once
                  </button>
                  <button
                    onClick={() => handleRejectUser(u.id)}
                    className="tone-rose px-3 py-1.5 rounded-xl border font-semibold flex items-center gap-1 transition hover:opacity-90"
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
                className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
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

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleProposalDecision(p.id, 'approved')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 transition playful-btn"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleProposalDecision(p.id, 'rejected')}
                    className="tone-rose px-3 py-1.5 rounded-xl border font-semibold flex items-center gap-1 transition hover:opacity-90"
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
              className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  name={u.display_name}
                  color={u.avatar_color}
                  src={u.avatarUrl}
                  size={28}
                  className="shadow-2xs"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-[var(--text-primary)] truncate">{u.display_name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">@{u.username}</span>

                    {u.role === 'admin' && (
                      <span className="tone-amber text-[9px] uppercase px-1.5 py-0.5 rounded border font-bold font-mono">
                        Admin
                      </span>
                    )}

                    {u.role === 'member' && u.status === 'active' && (
                      <span className="tone-emerald text-[9px] uppercase px-1.5 py-0.5 rounded border font-semibold font-mono flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[2.5]" /> Approved Member
                      </span>
                    )}

                    {u.role === 'pending' && (
                      <span className="tone-amber text-[9px] uppercase px-1.5 py-0.5 rounded border font-semibold font-mono flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> Pending Approval
                      </span>
                    )}

                    {u.status === 'suspended' && (
                      <span className="tone-rose text-[9px] uppercase px-1.5 py-0.5 rounded border font-bold font-mono">
                        Suspended
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:shrink-0">
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
                  className="px-2.5 py-1 text-xs rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] transition flex items-center gap-1"
                >
                  <Key className="w-3 h-3 text-[var(--tone-amber-fg)]" />
                  <span>Reset Link</span>
                </button>

                {u.role !== 'admin' && (
                  <button
                    onClick={() => handleToggleSuspend(u.id)}
                    className={`px-2.5 py-1 text-xs rounded-xl border transition flex items-center gap-1 ${
                      u.status === 'active'
                        ? 'tone-rose hover:opacity-90'
                        : 'tone-emerald hover:opacity-90'
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
                    className="tone-rose px-2.5 py-1 text-xs rounded-xl border hover:bg-rose-600 hover:text-white hover:border-rose-600 transition flex items-center gap-1 font-semibold"
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
                className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)] text-sm">{c.name}</span>
                    {c.isEveryone ? (
                      <span className="tone-emerald text-[9px] uppercase px-1.5 py-0.5 rounded border font-bold font-mono">
                        Everyone (Default)
                      </span>
                    ) : (
                      <span className="tone-sky text-[9px] uppercase px-1.5 py-0.5 rounded border font-bold font-mono">
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
                      className="tone-rose px-3 py-1.5 text-xs rounded-xl border hover:bg-rose-600 hover:text-white hover:border-rose-600 transition flex items-center gap-1.5 font-semibold"
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
                  <span className="font-semibold text-[var(--tone-rose-fg)] flex items-center gap-1">
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
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold"
                      >
                        Mark Resolved
                      </button>
                      <button
                        onClick={() => handleReportDecision(r.id, 'dismissed')}
                        className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-medium"
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
              className="p-3 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-3 font-mono"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-[var(--accent-coral)]">{log.action}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">by @{log.actor_username || 'system'}</span>
                </div>
                <p className="text-[var(--text-secondary)] mt-0.5 break-words">{log.details}</p>
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
        <div
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGeneratedLink(null);
          }}
        >
          <div className="w-full max-w-md p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl space-y-3">
            <h4 className="font-display font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-500" />
              One-Time Password Reset Key &amp; Link
            </h4>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Send this single-use reset key or link to <strong>@{generatedLink.username}</strong>. It expires in 24 hours and can only be used once.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  One-time reset key
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLink.token);
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 2000);
                  }}
                  className="text-[11px] font-semibold text-[var(--accent-amber)] hover:opacity-85 flex items-center gap-1 cursor-pointer"
                >
                  {copiedToken ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedToken ? 'Copied key' : 'Copy key'}</span>
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] font-mono text-xs text-[var(--accent-amber)] break-all select-all">
                {generatedLink.token}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                Direct reset link
              </span>
              <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] font-mono text-[11px] text-[var(--text-secondary)] break-all select-all">
                {generatedLink.link}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent-amber)] text-black flex items-center gap-1.5 playful-btn cursor-pointer"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Link' : 'Copy Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => setGeneratedLink(null)}
                className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
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
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteUserLoading) setUserToDelete(null);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
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
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteCircleLoading) setCircleToDelete(null);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
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

      {/* Clear Feed Confirmation Modal */}
      {showClearFeedConfirm && (
        <div
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !clearFeedLoading) setShowClearFeedConfirm(false);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--tone-amber-border)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
            <div className="flex items-center gap-2 text-[var(--tone-amber-fg)] font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Clear Feed Memories</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Are you sure you want to <strong>clear all test memories and collections from the feed</strong>?
              </p>
              <p className="tone-amber text-[11px] p-2.5 rounded-xl border">
                This will remove the current feed posts and sync the clean state to Neon so you can start fresh. All user accounts, circles, and stored files are kept completely safe.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={clearFeedLoading}
                onClick={() => setShowClearFeedConfirm(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearFeedLoading}
                onClick={handleClearFeed}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {clearFeedLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{clearFeedLoading ? 'Clearing Feed...' : 'Yes, Clear Feed'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Storage & Feed Confirmation Modal */}
      {showPurgeConfirm && (
        <div
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !purgeLoading) setShowPurgeConfirm(false);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-rose-500/30 rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Wipe Storage Bucket & Feed</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                {storageStatus?.backend === 'telegram' ? (
                  <>
                    Are you sure you want to <strong>clear all feed posts, collections, and local cache</strong>?
                  </>
                ) : (
                  <>
                    Are you sure you want to <strong>permanently delete all past files from your storage bucket</strong> and clear all posts and collections?
                  </>
                )}
              </p>
              <p className="tone-rose text-[11px] p-2.5 rounded-xl border">
                {storageStatus?.backend === 'telegram'
                  ? 'Feed memories, collections, and local server cache will be cleared. Original documents saved in your private Telegram channel remain safely archived (archive-on-delete).'
                  : 'This will delete every uploaded photo/video from Backblaze B2 and reset feed data so you can start with a completely clean slate.'}
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

      {/* Neon Database Diagnostics Modal */}
      {showDbModal && (
        <div
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !dbSyncLoading) setShowDbModal(false);
          }}
        >
          <div className="w-full max-w-md p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Neon Database Status</span>
              </div>
              <button
                onClick={() => setShowDbModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[var(--text-muted)] font-medium">Connection State</span>
                  <span
                    className={`font-semibold flex items-center gap-1.5 ${
                      dbStatus?.isTursoSynced
                        ? 'text-[var(--tone-emerald-fg)]'
                        : dbStatus?.tursoConfigured
                        ? 'text-[var(--tone-amber-fg)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${dbStatus?.isTursoSynced ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {dbStatus?.isTursoSynced ? 'Connected & Synced' : dbStatus?.tursoConfigured ? 'Connecting / Notice' : 'Local only - set DATABASE_URL'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[var(--text-muted)] font-medium">Neon database</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate max-w-[200px]" title={dbStatus?.tursoUrl || 'Not configured'}>
                    {dbStatus?.tursoUrl || 'Not configured'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[var(--text-muted)] font-medium">Last Neon Sync</span>
                  <span className="text-[var(--text-secondary)]">
                    {dbStatus?.lastSync ? new Date(dbStatus.lastSync).toLocaleString() : 'Not yet synced'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[var(--text-muted)] font-medium">Local Database Records</span>
                  <span className="text-[var(--text-secondary)] font-mono">
                    {dbStatus?.userCount ?? 0} user(s), {dbStatus?.postCount ?? 0} memory(ies), {dbStatus?.albumCount ?? 0} event(s)
                  </span>
                </div>
              </div>

              {dbStatus?.error && (
                <div className="tone-amber p-3 rounded-xl border text-[11px] space-y-1.5">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Sync Notice</span>
                  </div>
                  <pre className="font-mono whitespace-pre-wrap break-all text-[10px] text-[var(--text-secondary)]">
                    {dbStatus.error}
                  </pre>
                </div>
              )}

              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Database connection is set with the <span className="font-mono">DATABASE_URL</span> environment variable (Neon). Change it in the Render dashboard and redeploy.
              </p>

              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                When restored and synced, all your accounts, permanent permissions, friend circles, photos, captions, and albums are fetched directly from Neon.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                disabled={dbSyncLoading || restoreLoading}
                onClick={() => setShowDbModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={dbSyncLoading || restoreLoading}
                onClick={handleManualDbSync}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {dbSyncLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Sync with Neon</span>
              </button>
              <button
                type="button"
                disabled={dbSyncLoading || restoreLoading}
                onClick={handleRestoreFromTurso}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:opacity-95 transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {restoreLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{restoreLoading ? 'Restoring from Neon...' : 'Rebuild Cache from Neon'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Backend Diagnostics Modal (Read-Only, Server Env Configured) */}
      {showStorageModal && storageStatus && (
        <div
          className="scrim z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !storageTestLoading) setShowStorageModal(false);
          }}
        >
          <div className="w-full max-w-md p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                <HardDrive className="w-4 h-4 text-[var(--tone-sky-fg)]" />
                <span>Media Storage Diagnostics</span>
              </div>
              <button
                type="button"
                onClick={() => setShowStorageModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)] font-medium">Active Storage Engine</span>
                  <span className="font-semibold text-[var(--text-primary)] text-right">
                    {storageStatus.mode}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)] font-medium">Max Upload File Size</span>
                  <span className="font-mono font-bold text-[var(--tone-sky-fg)]">
                    {storageStatus.maxFileSizeLabel}
                  </span>
                </div>

                {storageStatus.backend === 'telegram' && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)] font-medium">Bot API Lane (≤ 15 MB)</span>
                      <span className={`font-semibold ${storageStatus.botApiEnabled ? 'text-[var(--tone-emerald-fg)]' : 'text-[var(--text-muted)]'}`}>
                        {storageStatus.botApiEnabled
                          ? storageStatus.customBotApiUrl
                            ? 'Enabled (Custom Server)'
                            : 'Enabled (Standard)'
                          : 'Disabled'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)] font-medium">MTProto Lane (Up to 2 GB)</span>
                      <span className={`font-semibold ${storageStatus.mtprotoEnabled ? 'text-[var(--tone-emerald-fg)]' : 'text-[var(--text-muted)]'}`}>
                        {storageStatus.mtprotoEnabled
                          ? storageStatus.mtprotoMode === 'external'
                            ? 'External Server'
                            : storageStatus.mtprotoConnected
                            ? 'Embedded • Connected'
                            : 'Embedded • Ready'
                          : 'Not Configured'}
                      </span>
                    </div>

                    {storageStatus.channelTitle && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[var(--text-muted)] font-medium">Telegram Channel</span>
                        <span className="font-semibold text-[var(--text-secondary)] truncate max-w-[200px]">
                          {storageStatus.channelTitle}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)] font-medium">Deletion Policy</span>
                      <span className="font-semibold text-[var(--tone-amber-fg)]">
                        Archive-on-Delete (Preserved)
                      </span>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-muted)] font-medium">Backblaze B2 Fallback</span>
                  <span className={`font-semibold ${storageStatus.b2FallbackEnabled ? 'text-[var(--tone-emerald-fg)]' : 'text-[var(--text-muted)]'}`}>
                    {storageStatus.b2FallbackEnabled ? 'Active (Legacy Reads)' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] font-medium">Stored Media Records</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                    {storageStatus.telegramFileCount} Telegram • {storageStatus.legacyFileCount} Legacy
                  </span>
                </div>
              </div>

              {storageTestResult && (
                <div
                  className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                    storageTestResult.ok
                      ? 'tone-emerald'
                      : 'tone-rose'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    {storageTestResult.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{storageTestResult.summary}</span>
                  </div>
                  {storageTestResult.lanes?.botApi?.enabled && (
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] pl-5">
                      Bot API: {storageTestResult.lanes.botApi.ok ? 'OK' : 'Error'}
                      {storageTestResult.lanes.botApi.botUsername ? ` (@${storageTestResult.lanes.botApi.botUsername})` : ''}
                      {storageTestResult.lanes.botApi.channelTitle ? ` → ${storageTestResult.lanes.botApi.channelTitle}` : ''}
                      {storageTestResult.lanes.botApi.error ? ` — ${storageTestResult.lanes.botApi.error}` : ''}
                    </div>
                  )}
                  {storageTestResult.lanes?.mtproto?.enabled && (
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] pl-5">
                      MTProto ({storageTestResult.lanes.mtproto.mode}): {storageTestResult.lanes.mtproto.ok ? 'OK' : 'Error'}
                      {storageTestResult.lanes.mtproto.channelTitle ? ` → ${storageTestResult.lanes.mtproto.channelTitle}` : ''}
                      {storageTestResult.lanes.mtproto.error ? ` — ${storageTestResult.lanes.mtproto.error}` : ''}
                    </div>
                  )}
                  {storageTestResult.lanes?.b2Fallback?.enabled && (
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] pl-5">
                      B2 Fallback: {storageTestResult.lanes.b2Fallback.ok ? 'OK' : 'Error'}
                      {storageTestResult.lanes.b2Fallback.error ? ` — ${storageTestResult.lanes.b2Fallback.error}` : ''}
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Storage credentials are configured strictly via server environment variables. New photos and videos upload uncompressed as original documents; legacy Backblaze B2 memories continue loading transparently.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={storageTestLoading}
                onClick={() => setShowStorageModal(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={storageTestLoading}
                onClick={handleTestStorageConnection}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${storageTestLoading ? 'animate-spin' : ''}`} />
                <span>{storageTestLoading ? 'Testing Connection...' : 'Test Storage Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {actionToast && (
        <div
          role="status"
          className={`fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-2xl border bg-[var(--bg-card)] px-4 py-2.5 text-xs font-semibold shadow-xl backdrop-blur-xl lg:bottom-6 ${
            actionToast.type === 'success'
              ? 'border-[var(--tone-emerald-border)] text-[var(--tone-emerald-fg)]'
              : 'border-[var(--tone-rose-border)] text-[var(--tone-rose-fg)]'
          }`}
        >
          {actionToast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionToast.message}</span>
        </div>
      )}
    </div>
  );
};
