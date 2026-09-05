import { z } from 'zod';

import { cefrLevelSchema } from './vocabulary';

export const wordBankViewSchema = z.enum(['list', 'card']);
export type WordBankView = z.infer<typeof wordBankViewSchema>;

export const userSettingsSchema = z.object({
  questionsPerQuiz: z.number().int().min(5).max(50),
  cefrLevels: z.array(cefrLevelSchema).nonempty(),
  pronunciationEnabled: z.boolean(),
  showChineseByDefault: z.boolean(),
  shuffleOptions: z.boolean(),
  wordBankView: wordBankViewSchema,
  keyboardShortcutsEnabled: z.boolean(),
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
};

/** Tolerant parse used for values coming from localStorage or an import file. */
export function parseSettings(value: unknown): UserSettings {
  const result = userSettingsSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_SETTINGS;
}
