import { useUITheme } from '../lib/ui-theme/UIThemeContext';
import { cx } from '../utils/classNames';

const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const UIThemePicker = () => {
  const { currentTheme, setTheme } = useUITheme();
  const isOffice = currentTheme.id === 'office';

  const toggle = () => setTheme(isOffice ? 'shopfloor' : 'office');

  return (
    <button
      onClick={toggle}
      className={cx(
        'flex items-center justify-center rounded p-1.5 text-theme-secondary transition-colors',
        'hover:bg-theme-surface hover:text-theme-text'
      )}
      title={isOffice ? 'Switch to Shop Floor (dark)' : 'Switch to Office (light)'}
      aria-label={isOffice ? 'Switch to Shop Floor theme' : 'Switch to Office theme'}
    >
      {isOffice ? <MoonIcon /> : <SunIcon />}
    </button>
  );
};
