import { z } from 'zod';

import { DEFAULT_REVIEW_INTERVALS_DAYS } from './review';
import { cefrLevelSchema } from './vocabulary';

export const wordBankViewSchema = z.enum(['list', 'card']);
export type WordBankView = z.infer<typeof wordBankViewSchema>;

/**
 * The spaced-repetition ladder: days to wait after each consecutive correct
 * answer. It must climb, because a schedule that shrinks as you get better
 * would review mastered words more often than new ones.
 *
 * `.default()` keeps older exported files (written before intervals were
 * configurable) importable — they simply get the standard ladder.
 */
export const reviewIntervalsSchema = z
  .array(z.number().int().min(1).max(365))
  .min(1)
  .max(10)
  .refine(
    (intervals) => intervals.every((days, index) => index === 0 || days > (intervals[index - 1] as number)),
    { message: 'intervals must be strictly increasing' },
  )
  .default([...DEFAULT_REVIEW_INTERVALS_DAYS]);

export const userSettingsSchema = z.object({
  questionsPerQuiz: z.number().int().min(5).max(50),
  cefrLevels: z.array(cefrLevelSchema).nonempty(),
  pronunciationEnabled: z.boolean(),
  showChineseByDefault: z.boolean(),
  shuffleOptions: z.boolean(),
  wordBankView: wordBankViewSchema,
  keyboardShortcutsEnabled: z.boolean(),
  reviewIntervalsDays: reviewIntervalsSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_SETTINGS: UserSettings = {
  questionsPerQuiz: 10,
  cefrLevels: ['B2', 'C1', 'C2'],
  pronunciationEnabled: true,
  showChineseByDefault: true,
  shuffleOptions: true,
  wordBankView: 'list',
  keyboardShortcutsEnabled: true,
  reviewIntervalsDays: [...DEFAULT_REVIEW_INTERVALS_DAYS],
};

/** Tolerant parse used for values coming from localStorage or an import file. */
export function parseSettings(value: unknown): UserSettings {
  const result = userSettingsSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_SETTINGS;
}

/** Named ladders offered in the UI, alongside a free-form custom option. */
export const REVIEW_INTERVAL_PRESETS = [
  { id: 'intensive', labelZh: '密集', days: [1, 2, 4, 8, 16] },
  { id: 'standard', labelZh: '標準', days: [...DEFAULT_REVIEW_INTERVALS_DAYS] },
  { id: 'relaxed', labelZh: '寬鬆', days: [2, 5, 12, 30, 60] },
] as const satisfies readonly { id: string; labelZh: string; days: number[] }[];

export function matchesPreset(intervals: readonly number[]): string | null {
  const found = REVIEW_INTERVAL_PRESETS.find(
    (preset) =>
      preset.days.length === intervals.length &&
      preset.days.every((day, index) => day === intervals[index]),
  );
  return found?.id ?? null;
}

/** Parses "1, 3, 7, 14, 30" into a validated ladder. */
export function parseIntervalInput(
  raw: string,
): { ok: true; days: number[] } | { ok: false; error: string } {
  const parts = raw
    .split(/[,、\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { ok: false, error: '請至少輸入一個間隔天數。' };

  const days: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return { ok: false, error: `「${part}」不是有效的天數。` };
    days.push(Number(part));
  }

  const result = reviewIntervalsSchema.safeParse(days);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? '間隔設定無效。';
    return {
      ok: false,
      error:
        message === 'intervals must be strictly increasing'
          ? '間隔天數必須由小到大遞增。'
          : `間隔設定無效：${message}（每個值需介於 1–365 天，最多 10 個階段）。`,
    };
  }
  return { ok: true, days: result.data };
}
