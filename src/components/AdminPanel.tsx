import React, { useState, useEffect } from 'react';
import { Shield, Check, X, Key, UserX, UserCheck, AlertTriangle, FileText, Clock, Copy, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { AuditLogItem } from '../types/index.ts';

export const AdminPanel: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'signups' | 'users' | 'proposals' | 'reports' | 'audit'>('signups');

  // If user is not an admin, do not render or fetch anything
  if (!isAdmin || user?.role !== 'admin') {
    return null;
  }

  const [pendingSignups, setPendingSignups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Generated reset link modal
  const [generatedLink, setGeneratedLink] = useState<{ username: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSignups = async () => {
    try {
      const res = await fetch('/api/admin/pending-signups');
      if (res.ok) {
        const data = await res.json();
        setPendingSignups(data.pending || []);
      }
    } catch (e) {}
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {}
  };

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/admin/pending-proposals');
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals || []);
      }
    } catch (e) {}
  };

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/admin/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {}
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/admin/audit-log');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab === 'signups') fetchSignups();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'proposals') fetchProposals();
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  const handleApproveUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/approve-user/${userId}`, { method: 'POST' });
      if (res.ok) {
        fetchSignups();
      }
    } catch (e) {}
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/reject-user/${userId}`, { method: 'POST' });
      if (res.ok) {
        fetchSignups();
      }
    } catch (e) {}
  };

  const handleToggleSuspend = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/toggle-suspend/${userId}`, { method: 'POST' });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {}
  };

  const handleGenerateReset = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/generate-reset-link/${userId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLink({ username: data.username, link: data.resetUrl });
        setCopied(false);
      }
    } catch (e) {}
  };

  const handleProposalDecision = async (proposalId: string, decision: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/decide`, {
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
      const res = await fetch(`/api/admin/reports/${reportId}/decide`, {
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
      {/* Admin Title */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-color)]">
        <Shield className="w-5 h-5 text-amber-500" />
        <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">
          Admin Portal
        </h2>
      </div>

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
          User Directory
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
                    onClick={() => handleApproveUser(u.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 transition playful-btn"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
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
              No pending album/event proposals from members.
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
                      {p.is_event ? 'Event Proposal' : 'Album Proposal'}
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
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[var(--text-primary)]">{u.display_name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">@{u.username}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] font-mono">
                      {u.role}
                    </span>
                    {u.status === 'suspended' && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-mono">
                        SUSPENDED
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
              </div>
            </div>
          ))}
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
    </div>
  );
};
