// ─── Top-Level Navigation ─────────────────────────────────────────────────────
// Tab nav: Studio / Learn / Audit / Members. Role-aware visibility.

import { Link, useLocation } from 'react-router-dom';
import { useOrgRole } from '../hooks/useOrgRole';
import { cx } from '../utils/classNames';

const TAB_BASE = 'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors';
const TAB_ACTIVE = 'bg-theme-surface text-theme-text';
const TAB_INACTIVE = 'text-theme-secondary hover:text-theme-text hover:bg-theme-surface/50';

export const TopNav = () => {
  const { pathname } = useLocation();
  const { canGenerate, canReview, isAdmin } = useOrgRole();

  const tabs: Array<{ to: string; label: string; visible: boolean }> = [
    { to: '/studio', label: 'Studio', visible: canGenerate },
    { to: '/learn', label: 'Learn', visible: true },
    { to: '/audit', label: 'Audit', visible: canReview || isAdmin },
    { to: '/members', label: 'Members', visible: isAdmin },
  ];

  const isActive = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/');

  return (
    <nav className="flex items-center gap-1">
      {tabs.filter((t) => t.visible).map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={cx(TAB_BASE, isActive(tab.to) ? TAB_ACTIVE : TAB_INACTIVE)}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
};
