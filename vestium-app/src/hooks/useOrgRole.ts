// ─── useOrgRole — map Clerk org role to local OrgRole ────────────────────────
import { useOrganization } from '@clerk/clerk-react';
import type { OrgRole } from '@complianceforge/types';

function mapClerkRole(clerkRole: string | null | undefined): OrgRole {
  if (!clerkRole) return 'learner';
  const short = clerkRole.replace(/^org:/, '');
  switch (short) {
    case 'admin':      return 'admin';
    case 'hr_manager': return 'hr_manager';
    case 'reviewer':   return 'reviewer';
    default:           return 'learner';
  }
}

export function useOrgRole() {
  const { membership } = useOrganization();
  const clerkRole = membership?.role ?? null;
  const role = mapClerkRole(clerkRole);

  return {
    role,
    isAdmin: role === 'admin',
    isHR: role === 'hr_manager',
    isReviewer: role === 'reviewer',
    isLearner: role === 'learner',
    canManageMembers: role === 'admin' || role === 'hr_manager',
    canGenerate: role === 'admin' || role === 'hr_manager',
    canReview: role === 'admin' || role === 'reviewer',
  };
}
