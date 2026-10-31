import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../lib/training-core/ThemeContext';

const titleForPath = (
  path: string,
  opts: {
    currentThemeId: string;
    curriculum: Array<{ id: number; title: string; lessons: Array<{ id: string; title: string }> }>;
    reviewTitle?: string;
    fieldReferenceTitle?: string;
    ladderBuilderTitle?: string;
    siemensTrackBreadcrumbTitle?: string;
  }
): string => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  const normalizedParts = parts[0] === opts.currentThemeId ? parts.slice(1) : parts;
  if (normalizedParts.length === 0) return 'Home';
  if (normalizedParts[0] === 'field-reference') return opts.fieldReferenceTitle ?? 'Field Reference';
  if (normalizedParts[0] === 'review') return opts.reviewTitle ?? 'Adaptive Review';
  if (normalizedParts[0] === 'builder') return opts.ladderBuilderTitle ?? 'Ladder Builder';
  if (normalizedParts[0] === 'siemens-track') {
    return opts.siemensTrackBreadcrumbTitle ?? 'Siemens TIA Track';
  }
  if (normalizedParts[0] === 'capstone') return 'Capstone Challenge';
  if (normalizedParts[0] === 'dashboard') return 'Dashboard';
  if (normalizedParts[0] === 'stage') {
    const stageId = Number(normalizedParts[1]);
    const stage = opts.curriculum.find((s) => s.id === stageId);
    if (normalizedParts.length === 2) return stage ? stage.title : 'Stage';
    if (normalizedParts[2] === 'lesson') {
      const lesson = stage?.lessons.find((l) => l.id === normalizedParts[3]);
      return lesson?.title ?? 'Lesson';
    }
    if (normalizedParts[2] === 'test') return 'Stage Test';
  }
  return normalizedParts[normalizedParts.length - 1];
};

export const Breadcrumbs = () => {
  const { currentTheme, currentThemeId } = useTheme();
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const crumbs = [{ path: '/', label: 'Home' }];

  let current = '';
  for (const p of parts) {
    current += `/${p}`;
    crumbs.push({
      path: current,
      label: titleForPath(current, {
        currentThemeId,
        curriculum: currentTheme.curriculum,
        reviewTitle: currentTheme.labels?.reviewTitle,
        fieldReferenceTitle: currentTheme.labels?.fieldReferenceTitle,
        ladderBuilderTitle: currentTheme.labels?.ladderBuilderTitle,
        siemensTrackBreadcrumbTitle: currentTheme.labels?.siemensTrackBreadcrumbTitle
      })
    });
  }

  return (
    <nav className="text-xs text-theme-secondary">
      <ul className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, idx) => (
          <li key={crumb.path} className="flex items-center gap-2">
            {idx !== 0 ? <span className="text-theme-muted">/</span> : null}
            <Link className="hover:text-amber-300" to={crumb.path}>
              {crumb.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
