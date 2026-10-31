import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react';
import { useTheme } from '../lib/training-core/ThemeContext';
import { useProgress } from '../features/progress/ProgressContext';
import { overallCompletionPercent } from '../features/progress/gating';
import { getDueReviewItems } from '../features/progress/review';
import { getContinuePath } from '../features/progress/useNextStep';
import { DEFAULT_THEME_ID } from '../lib/training-core/registry';
import { UIThemePicker } from './UIThemePicker';
import { cx } from '../utils/classNames';
import { useOrgRole } from '../hooks/useOrgRole';
import { getOrgMe, isBackendMode } from '../lib/api/client';
import { TopNav } from './TopNav';
import type { OrgRecord } from '@complianceforge/types';

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { currentTheme, currentThemeId } = useTheme();
  const { state } = useProgress();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { isAdmin } = useOrgRole();
  const isLandingPage = location.pathname === '/';
  const inThemeRoute = Boolean(params.themeId);
  const overall = overallCompletionPercent(state, currentTheme.curriculum);
  const dueReviewCount = getDueReviewItems(state).filter(
    (item) => (item.themeId ?? DEFAULT_THEME_ID) === currentThemeId
  ).length;
  const accentText = currentTheme.colors?.accentTextClassName ?? 'text-[var(--accent-controller-text)]';
  const accentBorder = currentTheme.colors?.accentBorderClassName ?? 'border-[var(--accent-controller-border)]';
  const accentBg = currentTheme.colors?.accentBgClassName ?? 'bg-[var(--accent-controller-bg)]';

  const continuePath = getContinuePath(state, currentTheme.curriculum, currentThemeId);

  // ── Onboarding check ──────────────────────────────────────────────────────
  const [org, setOrg] = useState<OrgRecord | null>(null);

  useEffect(() => {
    if (!isBackendMode() || !authLoaded || !isSignedIn || !isAdmin) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const res = await getOrgMe(token);
      if (!cancelled && res.ok) setOrg(res.data);
    })();
    return () => { cancelled = true; };
  }, [authLoaded, isSignedIn, isAdmin, getToken]);


  return (
    <>
    <header className="sticky top-0 z-20 border-b border-theme-border-subtle bg-theme-base backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="shrink-0">
            <img
              src="/assets/brand/vestium-pill.png"
              alt="Vestium"
              className="h-12 w-auto object-contain"
              loading="eager"
            />
          </Link>
        {isLandingPage ? null : (
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                  return;
                }
                navigate(`/${currentThemeId}/dashboard`);
              }}
              className="rounded border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text hover:border-theme-border-subtle"
            >
              Back
            </button>
            <Link
              to="/"
              className="rounded border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text hover:border-theme-border-subtle"
            >
              Home
            </Link>

            {/* Top-level Create / Learn / Audit navigation */}
            <SignedIn>
              <div className="hidden sm:flex items-center ml-2 border-l border-theme-border pl-2">
                <TopNav />
              </div>
            </SignedIn>

            {inThemeRoute ? (
              <Link to="/" className={cx('min-w-0 text-sm font-bold tracking-wide', accentText)}>
                <span className="inline-flex items-center gap-2">
                  {currentTheme.icon ? (
                    <span
                      className={cx(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-normal',
                        accentBorder,
                        accentBg
                      )}
                    >
                      {currentTheme.icon}
                    </span>
                  ) : null}
                  <span className="truncate">{currentTheme.title}</span>
                </span>
              </Link>
            ) : null}
          </div>
        )}
        </div>

        <div className="flex items-center gap-1.5">
          {!isLandingPage && inThemeRoute ? (
            <>
              <Link
                to={continuePath}
                className="rounded bg-cta px-3 py-1.5 text-xs font-semibold text-cta-text transition-colors hover:bg-cta-hover"
              >
                Continue
              </Link>
              <span className={cx('rounded border px-2 py-1 text-xs text-theme-text', accentBorder, accentBg)}>
                {overall}%{dueReviewCount > 0 ? ` · ${dueReviewCount} ready` : ''}
              </span>
            </>
          ) : null}
          <UIThemePicker />
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded border border-theme-border px-2 py-1 text-xs font-semibold text-theme-text hover:border-theme-border-subtle"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded bg-cta px-2 py-1 text-xs font-semibold text-cta-text hover:bg-cta-hover"
              >
                Sign up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <OrganizationSwitcher
              appearance={{
                elements: {
                  organizationSwitcherTrigger: 'text-theme-text hover:text-theme-text',
                },
              }}
            />
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>

    {/* Onboarding banner — admin only, when onboarding not yet completed */}
    {isBackendMode() && isAdmin && org && !org.onboardingCompleted ? (
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center">
        <Link
          to="/onboarding"
          className="text-xs font-semibold text-amber-200 hover:text-amber-100 transition-colors"
        >
          Complete your organisation setup to unlock all features
          <span className="ml-1">&rarr;</span>
        </Link>
      </div>
    ) : null}
    </>
  );
};
