// ─── RouteGuard — role-based route protection ───────────────────────────────

import type { ReactNode } from 'react';
import { useOrgRole } from '../hooks/useOrgRole';

type Permission = 'canGenerate' | 'canReview' | 'isAdmin';

interface Props {
  requires: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

const DEFAULT_MESSAGES: Record<Permission, string> = {
  canGenerate: 'You need a Creator role to access the Studio.',
  canReview: 'You need a Reviewer role to access this area.',
  isAdmin: 'You need an Admin role to access this area.',
};

export function RouteGuard({ requires, fallback, children }: Props) {
  const role = useOrgRole();

  const hasAccess = (() => {
    switch (requires) {
      case 'canGenerate': return role.canGenerate;
      case 'canReview': return role.canReview;
      case 'isAdmin': return role.isAdmin;
      default: return false;
    }
  })();

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm rounded-xl border border-theme-border bg-theme-panel px-8 py-10 text-center">
          <p className="text-sm font-semibold text-theme-text">Access restricted</p>
          <p className="mt-2 text-xs text-theme-secondary">
            {DEFAULT_MESSAGES[requires]} Contact your organisation admin.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
