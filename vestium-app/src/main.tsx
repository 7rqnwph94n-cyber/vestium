import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { router } from './app/router';
import { ProgressProvider } from './features/progress/ProgressContext';
import { ThemeProvider } from './lib/training-core/ThemeContext';
import { UIThemeProvider } from './lib/ui-theme/UIThemeContext';
import { DEFAULT_THEME_ID } from './lib/training-core/registry';
import './index.css';

const currentThemeId = DEFAULT_THEME_ID;
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!CLERK_KEY) {
  throw new Error('Missing Clerk Publishable Key (VITE_CLERK_PUBLISHABLE_KEY)');
}

const plausibleDomain = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;
const plausibleSrc = (import.meta.env.VITE_PLAUSIBLE_SRC as string | undefined) ?? 'https://plausible.io/js/script.js';

if (plausibleDomain && !document.querySelector(`script[data-domain="${plausibleDomain}"]`)) {
  const script = document.createElement('script');
  script.defer = true;
  script.dataset.domain = plausibleDomain;
  script.src = plausibleSrc;
  document.head.appendChild(script);
}

const app = (
  <UIThemeProvider>
    <ThemeProvider themeId={currentThemeId}>
      <ProgressProvider>
        <RouterProvider router={router} />
      </ProgressProvider>
    </ThemeProvider>
  </UIThemeProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      {app}
    </ClerkProvider>
  </React.StrictMode>
);
