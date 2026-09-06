import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  REVIEW_INTERVAL_PRESETS,
  matchesPreset,
  parseIntervalInput,
  parseSettings,
  reviewIntervalsSchema,
  userSettingsSchema,
} from './settings';

describe('reviewIntervalsSchema', () => {
  it('accepts a strictly increasing ladder', () => {
    expect(reviewIntervalsSchema.safeParse([1, 3, 7, 14, 30]).success).toBe(true);
    expect(reviewIntervalsSchema.safeParse([2]).success).toBe(true);
  });

  it('rejects a ladder that does not increase', () => {
    expect(reviewIntervalsSchema.safeParse([1, 3, 3, 7]).success).toBe(false);
    expect(reviewIntervalsSchema.safeParse([10, 5]).success).toBe(false);
  });

  it('rejects an empty ladder', () => {
    expect(reviewIntervalsSchema.safeParse([]).success).toBe(false);
  });

  it('rejects out-of-range or non-integer days', () => {
    expect(reviewIntervalsSchema.safeParse([0, 3]).success).toBe(false);
    expect(reviewIntervalsSchema.safeParse([1, 400]).success).toBe(false);
    expect(reviewIntervalsSchema.safeParse([1.5, 3]).success).toBe(false);
  });

  it('rejects an unreasonably long ladder', () => {
    expect(reviewIntervalsSchema.safeParse([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).success).toBe(false);
  });

  it('supplies the standard ladder when the field is absent', () => {
    expect(reviewIntervalsSchema.parse(undefined)).toEqual([1, 3, 7, 14, 30]);
  });
});

describe('userSettingsSchema', () => {
  it('accepts the defaults', () => {
    expect(userSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it('fills in the ladder for settings saved before it existed', () => {
    // Simulates a settings blob written by an older build.
    const legacy = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete legacy.reviewIntervalsDays;

    const result = userSettingsSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reviewIntervalsDays).toEqual([1, 3, 7, 14, 30]);
  });

  it('rejects an invalid ladder inside otherwise valid settings', () => {
    expect(
      userSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, reviewIntervalsDays: [5, 2] }).success,
    ).toBe(false);
  });

  it('falls back to defaults for unparseable input', () => {
    expect(parseSettings({ nonsense: true })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('presets', () => {
  it('every preset is itself a valid ladder', () => {
    for (const preset of REVIEW_INTERVAL_PRESETS) {
      expect(reviewIntervalsSchema.safeParse(preset.days).success, preset.id).toBe(true);
    }
  });

  it('identifies the ladder currently in use', () => {
    expect(matchesPreset([1, 3, 7, 14, 30])).toBe('standard');
    expect(matchesPreset([1, 2, 4, 8, 16])).toBe('intensive');
    expect(matchesPreset([2, 6])).toBeNull();
  });

  it('the standard preset is the default ladder', () => {
    expect(matchesPreset(DEFAULT_SETTINGS.reviewIntervalsDays)).toBe('standard');
  });
});

describe('parseIntervalInput', () => {
  it('parses a comma-separated list', () => {
    expect(parseIntervalInput('1, 3, 7, 14, 30')).toEqual({ ok: true, days: [1, 3, 7, 14, 30] });
  });

  it('tolerates spaces and full-width separators', () => {
    expect(parseIntervalInput('2 5  12')).toEqual({ ok: true, days: [2, 5, 12] });
    expect(parseIntervalInput('2、5、12')).toEqual({ ok: true, days: [2, 5, 12] });
  });

  it('rejects an empty input', () => {
    expect(parseIntervalInput('   ')).toMatchObject({ ok: false });
  });

  it('rejects non-numeric entries by name', () => {
    const result = parseIntervalInput('1, three, 7');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('three');
  });

  it('explains a non-increasing ladder in Chinese', () => {
    const result = parseIntervalInput('7, 3');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('遞增');
  });

  it('rejects zero and negative days', () => {
    expect(parseIntervalInput('0, 3')).toMatchObject({ ok: false });
    expect(parseIntervalInput('-1, 3')).toMatchObject({ ok: false });
  });
});
