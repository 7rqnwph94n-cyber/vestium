import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { INDUSTRY_OPTIONS, WORKFORCE_SIZE_OPTIONS, HAZARD_OPTIONS } from '../../lib/constants/workplaceOptions';
import { getOrgMe, updateOrgProfile, inviteMembers, completeOnboarding } from '../../lib/api/client';
import type { OrgRole } from '@complianceforge/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingInvite {
  email: string;
  name: string;
  role: OrgRole;
}

const STEPS = ['Company Profile', 'Workplace Context', 'Invite Team', 'Review & Complete'] as const;

const ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'learner', label: 'Learner' },
];

// ─── Shared styles ──────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded border border-theme-border bg-theme-panel px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-violet-500 focus:outline-none';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-theme-secondary';

const selectClass =
  'w-full rounded border border-theme-border bg-theme-panel px-3 py-2 text-sm text-theme-text focus:border-violet-500 focus:outline-none';

// ─── Main component ─────────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');

  // Step 1: Company Profile
  const [industry, setIndustry] = useState('');
  const [workforceSize, setWorkforceSize] = useState('');

  // Step 2: Workplace Context
  const [operations, setOperations] = useState('');
  const [hazards, setHazards] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');

  // Step 3: Invite Team
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('learner');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  // Load existing org data
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await getOrgMe(token);
      if (cancelled) return;
      if (res.ok) {
        setOrgName(res.data.name);
        if (res.data.industry) setIndustry(res.data.industry);
        if (res.data.workforceSize) setWorkforceSize(res.data.workforceSize);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const toggleHazard = useCallback((id: string) => {
    setHazards((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  }, []);

  const addInvite = useCallback(() => {
    const email = inviteEmail.trim();
    const name = inviteName.trim();
    if (!email || !name) return;
    if (pendingInvites.some((i) => i.email === email)) return;
    setPendingInvites((prev) => [...prev, { email, name, role: inviteRole }]);
    setInviteEmail('');
    setInviteName('');
    setInviteRole('learner');
  }, [inviteEmail, inviteName, inviteRole, pendingInvites]);

  const removeInvite = useCallback((email: string) => {
    setPendingInvites((prev) => prev.filter((i) => i.email !== email));
  }, []);

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError('Not authenticated'); setLoading(false); return; }

      // Save profile
      const profileRes = await updateOrgProfile(token, { industry, workforceSize });
      if (!profileRes.ok) { setError(profileRes.error); setLoading(false); return; }

      // Send invites (if any)
      if (pendingInvites.length > 0) {
        const inviteRes = await inviteMembers(token, pendingInvites);
        if (!inviteRes.ok) { setError(inviteRes.error); setLoading(false); return; }
      }

      // Mark onboarding complete
      const completeRes = await completeOnboarding(token);
      if (!completeRes.ok) { setError(completeRes.error); setLoading(false); return; }

      navigate('/modules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return Boolean(industry && workforceSize);
      case 1: return Boolean(operations.trim());
      case 2: return true; // invites are optional
      case 3: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-theme-base text-theme-text">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-theme-text">Welcome to Vestium</h1>
          {orgName ? (
            <p className="mt-1 text-sm text-theme-secondary">Setting up {orgName}</p>
          ) : null}
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    i < step
                      ? 'bg-violet-600 text-white'
                      : i === step
                      ? 'border-2 border-violet-500 bg-violet-500/20 text-violet-300'
                      : 'border border-theme-border text-theme-muted'
                  }`}
                >
                  {i < step ? '\u2713' : i + 1}
                </div>
                <span className={`mt-1 text-[10px] ${i === step ? 'text-violet-300' : 'text-theme-muted'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <div className={`h-px w-8 ${i < step ? 'bg-violet-600' : 'bg-theme-raised'}`} />
              ) : null}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-theme-border bg-theme-panel/70 p-6 shadow-lg shadow-theme/40">
          {step === 0 ? (
            <StepCompanyProfile
              industry={industry}
              setIndustry={setIndustry}
              workforceSize={workforceSize}
              setWorkforceSize={setWorkforceSize}
            />
          ) : step === 1 ? (
            <StepWorkplaceContext
              operations={operations}
              setOperations={setOperations}
              hazards={hazards}
              toggleHazard={toggleHazard}
              additionalContext={additionalContext}
              setAdditionalContext={setAdditionalContext}
            />
          ) : step === 2 ? (
            <StepInviteTeam
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteName={inviteName}
              setInviteName={setInviteName}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              pendingInvites={pendingInvites}
              addInvite={addInvite}
              removeInvite={removeInvite}
            />
          ) : (
            <StepReview
              orgName={orgName}
              industry={industry}
              workforceSize={workforceSize}
              operations={operations}
              hazards={hazards}
              additionalContext={additionalContext}
              pendingInvites={pendingInvites}
            />
          )}

          {/* Error */}
          {error ? (
            <p className="mt-4 rounded bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
          ) : null}

          {/* Navigation buttons */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => { setStep((s) => s - 1); setError(null); }}
              className="rounded border border-theme-border px-4 py-2 text-sm font-semibold text-theme-secondary hover:border-theme-border disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={() => { setStep((s) => s + 1); setError(null); }}
                className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleComplete()}
                className="rounded bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
              >
                {loading ? 'Completing...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Company Profile ────────────────────────────────────────────────

function StepCompanyProfile(props: {
  industry: string;
  setIndustry: (v: string) => void;
  workforceSize: string;
  setWorkforceSize: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-theme-text">Company Profile</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Tell us about your organisation so we can tailor regulatory schemas and training modules.
        </p>
      </div>

      <div>
        <label className={labelClass}>Industry</label>
        <select
          className={selectClass}
          value={props.industry}
          onChange={(e) => props.setIndustry(e.target.value)}
        >
          <option value="">Select industry...</option>
          {INDUSTRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Workforce Size</label>
        <select
          className={selectClass}
          value={props.workforceSize}
          onChange={(e) => props.setWorkforceSize(e.target.value)}
        >
          <option value="">Select workforce size...</option>
          {WORKFORCE_SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Step 2: Workplace Context ──────────────────────────────────────────────

function StepWorkplaceContext(props: {
  operations: string;
  setOperations: (v: string) => void;
  hazards: string[];
  toggleHazard: (id: string) => void;
  additionalContext: string;
  setAdditionalContext: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-theme-text">Workplace Context</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Describe your operations and hazard profile. This informs regulatory classification and module generation.
        </p>
      </div>

      <div>
        <label className={labelClass}>Operations Description</label>
        <textarea
          className={inputClass}
          rows={4}
          placeholder="Describe your primary operations, processes, and work activities..."
          value={props.operations}
          onChange={(e) => props.setOperations(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Hazard Keywords</label>
        <p className="mb-2 text-xs text-theme-muted">Select all that apply to your workplace.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {HAZARD_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                props.hazards.includes(opt.id)
                  ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
                  : 'border-theme-border bg-theme-surface/50 text-theme-secondary hover:border-theme-border'
              }`}
            >
              <input
                type="checkbox"
                checked={props.hazards.includes(opt.id)}
                onChange={() => props.toggleHazard(opt.id)}
                className="accent-violet-500"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass}>Additional Context (optional)</label>
        <textarea
          className={inputClass}
          rows={3}
          placeholder="Any additional context about your workplace, special requirements, or regulatory concerns..."
          value={props.additionalContext}
          onChange={(e) => props.setAdditionalContext(e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Step 3: Invite Team ────────────────────────────────────────────────────

function StepInviteTeam(props: {
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteName: string;
  setInviteName: (v: string) => void;
  inviteRole: OrgRole;
  setInviteRole: (v: OrgRole) => void;
  pendingInvites: PendingInvite[];
  addInvite: () => void;
  removeInvite: (email: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-theme-text">Invite Team Members</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Add team members who will use Vestium. You can also do this later from the Members page.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              placeholder="name@company.com"
              value={props.inviteEmail}
              onChange={(e) => props.setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Full name"
              value={props.inviteName}
              onChange={(e) => props.setInviteName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select
              className={selectClass}
              value={props.inviteRole}
              onChange={(e) => props.setInviteRole(e.target.value as OrgRole)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          disabled={!props.inviteEmail.trim() || !props.inviteName.trim()}
          onClick={props.addInvite}
          className="rounded border border-violet-500/60 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add to invites
        </button>
      </div>

      {/* Pending invites list */}
      {props.pendingInvites.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
            Pending Invites ({props.pendingInvites.length})
          </p>
          {props.pendingInvites.map((invite) => (
            <div
              key={invite.email}
              className="flex items-center justify-between rounded border border-theme-border bg-theme-surface/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-theme-text">{invite.name}</p>
                <p className="text-xs text-theme-secondary">{invite.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded border border-theme-border px-2 py-0.5 text-[10px] font-semibold uppercase text-theme-secondary">
                  {invite.role.replace('_', ' ')}
                </span>
                <button
                  type="button"
                  onClick={() => props.removeInvite(invite.email)}
                  className="text-xs text-theme-muted hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-theme-muted">No invites added yet. You can skip this step and invite members later.</p>
      )}
    </div>
  );
}

// ─── Step 4: Review & Complete ──────────────────────────────────────────────

function StepReview(props: {
  orgName: string;
  industry: string;
  workforceSize: string;
  operations: string;
  hazards: string[];
  additionalContext: string;
  pendingInvites: PendingInvite[];
}) {
  const industryLabel = INDUSTRY_OPTIONS.find((o) => o.value === props.industry)?.label ?? props.industry;
  const sizeLabel = WORKFORCE_SIZE_OPTIONS.find((o) => o.value === props.workforceSize)?.label ?? props.workforceSize;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-theme-text">Review & Complete</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Review your setup before completing onboarding.
        </p>
      </div>

      {/* Company Profile summary */}
      <div className="rounded border border-theme-border bg-theme-surface/50 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">Company Profile</p>
        <div className="space-y-1 text-sm">
          {props.orgName ? <p className="text-theme-text">Organisation: <span className="text-theme-text font-medium">{props.orgName}</span></p> : null}
          <p className="text-theme-text">Industry: <span className="text-theme-text font-medium">{industryLabel}</span></p>
          <p className="text-theme-text">Workforce: <span className="text-theme-text font-medium">{sizeLabel}</span></p>
        </div>
      </div>

      {/* Workplace Context summary */}
      <div className="rounded border border-theme-border bg-theme-surface/50 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">Workplace Context</p>
        <div className="space-y-1 text-sm">
          <p className="text-theme-secondary">{props.operations}</p>
          {props.hazards.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {props.hazards.map((h) => {
                const label = HAZARD_OPTIONS.find((o) => o.id === h)?.label ?? h;
                return (
                  <span key={h} className="rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {props.additionalContext ? (
            <p className="mt-2 text-xs text-theme-secondary italic">{props.additionalContext}</p>
          ) : null}
        </div>
      </div>

      {/* Team Invites summary */}
      <div className="rounded border border-theme-border bg-theme-surface/50 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">
          Team Invites ({props.pendingInvites.length})
        </p>
        {props.pendingInvites.length > 0 ? (
          <div className="space-y-1">
            {props.pendingInvites.map((invite) => (
              <p key={invite.email} className="text-sm text-theme-secondary">
                {invite.name} ({invite.email}) — <span className="text-theme-secondary">{invite.role.replace('_', ' ')}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-theme-muted">No invites — you can add members later.</p>
        )}
      </div>
    </div>
  );
}
