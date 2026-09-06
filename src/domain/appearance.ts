import { z } from 'zod';

/**
 * Appearance preferences are deliberately per-browser rather than per-account:
 * the right theme, text size and line length depend on the screen in front of
 * you, not on who is signed in. They are therefore kept out of `UserSettings`
 * (which syncs to D1) and stored in this browser only.
 */

export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

/** The theme actually painted, once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

export const fontSizeSchema = z.enum(['small', 'medium', 'large']);
export type FontSize = z.infer<typeof fontSizeSchema>;

export const contentWidthSchema = z.enum(['narrow', 'standard', 'wide']);
export type ContentWidth = z.infer<typeof contentWidthSchema>;

/**
 * Every field falls back on its own, so a preferences object written by an
 * older version of the app keeps whatever it does know and picks up defaults
 * for the rest.
 */
export const appearanceSchema = z.object({
  theme: themePreferenceSchema.catch('system'),
  fontSize: fontSizeSchema.catch('medium'),
  contentWidth: contentWidthSchema.catch('standard'),
});
export type Appearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  fontSize: 'medium',
  contentWidth: 'standard',
};

/** Tolerant parse for values coming from localStorage. */
export function parseAppearance(value: unknown): Appearance {
  if (typeof value !== 'object' || value === null) return DEFAULT_APPEARANCE;
  const result = appearanceSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_APPEARANCE;
}

export function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

export const THEME_OPTIONS = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
] as const satisfies readonly { value: FontSize; label: string }[];

export const CONTENT_WIDTH_OPTIONS = [
  { value: 'narrow', label: '窄' },
  { value: 'standard', label: '標準' },
  { value: 'wide', label: '寬' },
] as const satisfies readonly { value: ContentWidth; label: string }[];
