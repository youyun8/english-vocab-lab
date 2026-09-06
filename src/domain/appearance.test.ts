import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
  type Appearance,
} from './appearance';

describe('parseAppearance', () => {
  it('accepts a complete, valid object', () => {
    const stored: Appearance = { theme: 'dark', fontSize: 'large', contentWidth: 'wide' };
    expect(parseAppearance(stored)).toEqual(stored);
  });

  it('fills in fields written by an older version', () => {
    expect(parseAppearance({ theme: 'dark' })).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'dark',
    });
  });

  it('drops individual values it does not recognise', () => {
    expect(parseAppearance({ theme: 'sepia', fontSize: 'large' })).toEqual({
      ...DEFAULT_APPEARANCE,
      fontSize: 'large',
    });
  });

  it('falls back completely for a non-object', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('dark')).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('resolveTheme', () => {
  it('follows the system only for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets an explicit choice win over the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
