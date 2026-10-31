import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_UI_THEME_ID, UI_THEMES, type UIThemeDef } from './themes';

const LS_KEY = 'ui-theme-pref';

/** Map legacy theme IDs to the new two-theme system */
const migrateThemeId = (stored: string): string => {
  if (stored === 'dawn') return 'office';
  if (['industrial', 'terminal', 'midnight', 'carbon', 'frost'].includes(stored)) return 'shopfloor';
  return stored;
};

interface UIThemeContextValue {
  currentTheme: UIThemeDef;
  setTheme: (id: string) => void;
  themes: UIThemeDef[];
}

const UIThemeContext = createContext<UIThemeContextValue>({
  currentTheme: UI_THEMES[0],
  setTheme: () => undefined,
  themes: UI_THEMES
});

export const UIThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const migrated = migrateThemeId(stored);
        if (UI_THEMES.some((t) => t.id === migrated)) return migrated;
      }
    } catch {
      // ignore
    }
    return DEFAULT_UI_THEME_ID;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', themeId);
  }, [themeId]);

  const setTheme = useCallback((id: string) => {
    if (!UI_THEMES.some((t) => t.id === id)) return;
    setThemeId(id);
    try {
      localStorage.setItem(LS_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<UIThemeContextValue>(() => ({
    currentTheme: UI_THEMES.find((t) => t.id === themeId) ?? UI_THEMES[0],
    setTheme,
    themes: UI_THEMES
  }), [themeId, setTheme]);

  return (
    <UIThemeContext.Provider value={value}>
      {children}
    </UIThemeContext.Provider>
  );
};

export const useUITheme = () => useContext(UIThemeContext);
