import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useOrgRole } from '../../hooks/useOrgRole';
import {
  listMembers,
  inviteMembers,
  updateMember,
  suspendMember,
  removeMember,
  syncMembers,
} from '../../lib/api/client';
import type { OrgMemberRecord, OrgRole } from '@complianceforge/types';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'learner', label: 'Learner' },
];

const STATUS_STYLES: Record<string, string> = {
  active:    'border-emerald-500/60 text-emerald-300 bg-emerald-500/10',
  invited:   'border-amber-500/60 text-amber-300 bg-amber-500/10',
  suspended: 'border-red-500/60 text-red-300 bg-red-500/10',
};

// ─── Shared styles ──────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded border border-theme-border bg-theme-panel px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-violet-500 focus:outline-none';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-theme-secondary';

const selectClass =
  'rounded border border-theme-border bg-theme-panel px-2 py-1.5 text-xs text-theme-text focus:border-violet-500 focus:outline-none';

// ─── Main component ─────────────────────────────────────────────────────────

export function MembersPage() {
  const { getToken } = useAuth();
  const { isAdmin, canManageMembers } = useOrgRole();

  const [members, setMembers] = useState<OrgMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Inline invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('learner');
  const [inviting, setInviting] = useState(false);

  // Confirm actions
  const [confirmAction, setConfirmAction] = useState<{ type: 'suspend' | 'remove'; memberId: string } | null>(null);

  // Syncing state
  const [syncing, setSyncing] = useState(false);

  // ── Load members ──────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    const token = await getToken();
    if (!token) { setError('Not authenticated'); setLoading(false); return; }
    const res = await listMembers(token);
    if (!res.ok) { setError(res.error); setLoading(false); return; }
    setMembers(res.data);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    const name = inviteName.trim();
    if (!email || !name) return;

    setInviting(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); return; }
      const res = await inviteMembers(token, [{ email, name, role: inviteRole }]);
      if (!res.ok) { setError(res.error); return; }
      setMessage(`Invited ${name} (${email})`);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('learner');
      setShowInviteForm(false);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); return; }
      const res = await updateMember(token, memberId, { role: newRole });
      if (!res.ok) { setError(res.error); return; }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? res.data : m)));
      setMessage('Role updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleSuspend = async (memberId: string) => {
    if (confirmAction?.type !== 'suspend' || confirmAction.memberId !== memberId) {
      setConfirmAction({ type: 'suspend', memberId });
      return;
    }
    setConfirmAction(null);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); return; }
      const res = await suspendMember(token, memberId);
      if (!res.ok) { setError(res.error); return; }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? res.data : m)));
      setMessage('Member suspended');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend member');
    }
  };

  const handleRemove = async (memberId: string) => {
    if (confirmAction?.type !== 'remove' || confirmAction.memberId !== memberId) {
      setConfirmAction({ type: 'remove', memberId });
      return;
    }
    setConfirmAction(null);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); return; }
      const res = await removeMember(token, memberId);
      if (!res.ok) { setError(res.error); return; }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setMessage('Member removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); return; }
      const res = await syncMembers(token);
      if (!res.ok) { setError(res.error); return; }
      setMessage(`Synced ${res.data.synced} member(s) from Clerk`);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setSyncing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded border border-theme-border bg-theme-panel/60 p-4 text-sm text-theme-secondary">
        Loading members...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-theme-text">Team Members</h1>
          <p className="mt-0.5 text-xs text-theme-secondary">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageMembers ? (
            <>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void handleSync()}
                className="rounded border border-theme-border px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:border-theme-border hover:text-theme-text transition-colors disabled:opacity-40"
              >
                {syncing ? 'Syncing...' : 'Sync from Clerk'}
              </button>
              <button
                type="button"
                onClick={() => setShowInviteForm((v) => !v)}
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                {showInviteForm ? 'Cancel' : 'Invite Employee'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Status messages */}
      {error ? <p className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {message ? <p className="rounded bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">{message}</p> : null}

      {/* Inline invite form */}
      {showInviteForm && canManageMembers ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-theme-text">Invite Employee</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                className={inputClass}
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select
                className={`${inputClass}`}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={inviting || !inviteEmail.trim() || !inviteName.trim()}
            onClick={() => void handleInvite()}
            className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {inviting ? 'Inviting...' : 'Send Invite'}
          </button>
        </div>
      ) : null}

      {/* Members table */}
      {members.length === 0 ? (
        <div className="rounded border border-theme-border bg-theme-panel/60 p-8 text-center text-sm text-theme-secondary">
          No members yet. Invite your first team member above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-theme-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-theme-border bg-theme-panel">
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden sm:table-cell">Job Title</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary hidden md:table-cell">Department</th>
                <th className="px-4 py-3 text-left font-semibold text-theme-secondary">Status</th>
                {isAdmin ? (
                  <th className="px-4 py-3 text-right font-semibold text-theme-secondary">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border-subtle">
              {members.map((member) => (
                <tr key={member.id} className="transition-colors hover:bg-theme-surface/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-theme-text">{member.name}</p>
                  </td>
                  <td className="px-4 py-3 text-theme-secondary">{member.email}</td>
                  <td className="px-4 py-3">
                    {canManageMembers ? (
                      <select
                        className={selectClass}
                        value={member.role}
                        onChange={(e) => void handleRoleChange(member.id, e.target.value as OrgRole)}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded border border-theme-border px-2 py-0.5 text-xs font-semibold uppercase text-theme-secondary">
                        {member.role.replace('_', ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-theme-secondary">
                    {member.jobTitle ?? '\u2014'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-theme-secondary">
                    {member.department ?? '\u2014'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[member.status] ?? 'border-theme-border text-theme-secondary'}`}>
                      {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                    </span>
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {member.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void handleSuspend(member.id)}
                            className={`rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                              confirmAction?.type === 'suspend' && confirmAction.memberId === member.id
                                ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                : 'border-theme-border text-theme-secondary hover:border-amber-500/60 hover:text-amber-300'
                            }`}
                          >
                            {confirmAction?.type === 'suspend' && confirmAction.memberId === member.id ? 'Confirm?' : 'Suspend'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleRemove(member.id)}
                          className={`rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                            confirmAction?.type === 'remove' && confirmAction.memberId === member.id
                              ? 'border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30'
                              : 'border-theme-border text-theme-secondary hover:border-red-500/60 hover:text-red-300'
                          }`}
                        >
                          {confirmAction?.type === 'remove' && confirmAction.memberId === member.id ? 'Confirm?' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
