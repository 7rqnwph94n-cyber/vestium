import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_THEME_ID,
  modulesRegistry,
  dynamicModulesRegistry,
  registerDynamicModule,
  onStaticModulesReady
} from './registry';
import type { ThemeConfig } from './types';
import { THEME_STORAGE_KEY } from '../../utils/constants';
const PREVIEW_KEY_PREFIX = 'studio-preview-';
const GENERATED_ACCENT_BY_THEME_ID: Record<
  string,
  { text: string; border: string; bg: string; solid: string }
> = {};

// Minimal stub theme returned when no real module is loaded (e.g., on first app
// load before the learner navigates to a module). Keeps the context non-nullable.
const EMPTY_THEME: ThemeConfig = {
  id: '',
  title: '',
  description: '',
  curriculum: [],
};

type ThemeContextValue = {
  currentThemeId: string;
  currentTheme: ThemeConfig;
  setCurrentThemeId: (themeId: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Load any Studio-previewed modules stored in localStorage into the dynamic registry. */
function loadPreviewModules(): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREVIEW_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const config = JSON.parse(raw) as ThemeConfig;
      if (config?.id && !modulesRegistry[config.id]) {
        registerDynamicModule(config);
      }
    }
  } catch {
    // Ignore storage/parse errors
  }
}

export const ThemeProvider = ({
  children,
  themeId = DEFAULT_THEME_ID
}: {
  children: ReactNode;
  themeId?: string;
}) => {
  // Re-seed theme from localStorage when lazy-loaded static modules arrive
  const [registryVersion, setRegistryVersion] = useState(0);
  useEffect(() => {
    onStaticModulesReady(() => {
      setRegistryVersion((v) => v + 1);
      // Re-check localStorage — the initial useState may have missed a stored
      // theme ID because modulesRegistry was empty at that point.
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored) {
          const all = { ...modulesRegistry, ...dynamicModulesRegistry };
          if (all[stored]) setSelectedThemeIdState(stored);
        }
      } catch { /* ignore */ }
    });
  }, []);

  const [selectedThemeId, setSelectedThemeIdState] = useState<string>(() => {
    // Load any preview modules from localStorage before resolving the initial theme
    loadPreviewModules();

    const allModules = { ...modulesRegistry, ...dynamicModulesRegistry };
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && allModules[stored]) return stored;
    } catch {
      // Ignore localStorage access issues and use defaults.
    }
    return allModules[themeId] ? themeId : DEFAULT_THEME_ID;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, selectedThemeId);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [selectedThemeId]);

  useEffect(() => {
    const allModules = { ...modulesRegistry, ...dynamicModulesRegistry };
    const activeTheme = allModules[selectedThemeId];
    if (!activeTheme) return;
    const palette = GENERATED_ACCENT_BY_THEME_ID[activeTheme.id];
    if (!palette) return;
    document.documentElement.style.setProperty('--accent-gen-text', palette.text);
    document.documentElement.style.setProperty('--accent-gen-border', palette.border);
    document.documentElement.style.setProperty('--accent-gen-bg', palette.bg);
    document.documentElement.style.setProperty('--accent-gen-solid', palette.solid);
  }, [selectedThemeId]);

  const value = useMemo<ThemeContextValue>(() => {
    const allModules = { ...modulesRegistry, ...dynamicModulesRegistry };
    const fallbackTheme = allModules[DEFAULT_THEME_ID];
    const currentTheme = allModules[selectedThemeId] ?? fallbackTheme ?? EMPTY_THEME;
    return {
      currentThemeId: currentTheme.id,
      currentTheme,
      setCurrentThemeId: (nextThemeId: string) => {
        const all = { ...modulesRegistry, ...dynamicModulesRegistry };
        setSelectedThemeIdState(all[nextThemeId] ? nextThemeId : DEFAULT_THEME_ID);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThemeId, registryVersion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
};
