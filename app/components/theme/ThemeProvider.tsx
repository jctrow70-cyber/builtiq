'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  type ThemeId,
  resolveThemeId,
} from '../../../lib/theme/themes';

type ThemeContextValue = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  reducedMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

type ThemeProviderProps = {
  children: ReactNode;
  /** Optional profile theme from database when column exists */
  profileTheme?: string | null;
  onThemePersist?: (themeId: ThemeId) => void;
};

export default function ThemeProvider({
  children,
  profileTheme,
  onThemePersist,
}: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
    const fromProfile = profileTheme ? resolveThemeId(profileTheme) : null;
    const initial = fromProfile || resolveThemeId(stored);
    setThemeIdState(initial);
    setHydrated(true);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onMotionChange);
    return () => mq.removeEventListener('change', onMotionChange);
  }, [profileTheme]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute('data-theme', themeId);
    document.documentElement.style.colorScheme = themeId === 'calm' ? 'light' : 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeId === 'calm' ? '#ffffff' : '#000000');
    onThemePersist?.(themeId);
  }, [themeId, hydrated, onThemePersist]);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
  }, []);

  const value = useMemo(
    () => ({ themeId, setThemeId, reducedMotion }),
    [themeId, setThemeId, reducedMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
