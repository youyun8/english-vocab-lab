import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
  type Appearance,
  type ResolvedTheme,
} from '@/domain/appearance';
import { STORAGE_KEYS } from '@/repositories/anonymous-progress-repository';

interface AppearanceContextValue {
  appearance: Appearance;
  /** The theme actually painted right now — `system` already resolved. */
  resolvedTheme: ResolvedTheme;
  update: (patch: Partial<Appearance>) => void;
  reset: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStored(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.appearance);
    return raw ? parseAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    // A disabled or full localStorage must never keep the app from rendering.
    return DEFAULT_APPEARANCE;
  }
}

function store(appearance: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEYS.appearance, JSON.stringify(appearance));
  } catch {
    /* preferences simply do not survive a reload */
  }
}

function prefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

/**
 * Writes the preferences onto `<html>`, where the stylesheet picks them up.
 * The same attributes are set by the inline script in `index.html`, so the
 * first paint already carries the stored theme and nothing flashes.
 */
export function applyAppearance(
  root: HTMLElement,
  appearance: Appearance,
  theme: ResolvedTheme,
): void {
  root.dataset.theme = theme;
  root.dataset.fontSize = appearance.fontSize;
  root.dataset.width = appearance.contentWidth;
  root.style.colorScheme = theme;

  // Keep the browser UI (mobile address bar) in step with the header colour.
  const themeColor = root.ownerDocument.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', theme === 'dark' ? '#201f1d' : '#ffffff');
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(readStored);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = resolveTheme(appearance.theme, systemDark);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, resolvedTheme);
  }, [appearance, resolvedTheme]);

  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance((previous) => {
      const next = { ...previous, ...patch };
      store(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE);
    store(DEFAULT_APPEARANCE);
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, resolvedTheme, update, reset }),
    [appearance, resolvedTheme, update, reset],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside an AppearanceProvider');
  return context;
}
