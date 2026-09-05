import type { WordProgress } from '@/domain/progress';
import type { UserSettings } from '@/domain/settings';

/**
 * Persistence boundary for user-owned data.
 *
 * `AnonymousProgressRepository` writes to localStorage; `CloudProgressRepository`
 * talks to the Worker, which owns D1. Pages depend only on this interface, so
 * signing in swaps the implementation without any component changing.
 */
export interface ProgressRepository {
  getAll(): Promise<WordProgress[]>;
  getByWordId(wordId: string): Promise<WordProgress | null>;
  upsert(progress: WordProgress): Promise<void>;
  upsertMany(progress: WordProgress[]): Promise<void>;
  clear(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
}
