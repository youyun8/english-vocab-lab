import { wordProgressSchema, type WordProgress } from '@/domain/progress';
import { DEFAULT_SETTINGS, parseSettings, type UserSettings } from '@/domain/settings';
import type { ProgressRepository, SettingsRepository } from './progress-repository';

/**
 * localStorage-backed persistence for signed-out learners.
 *
 * Everything is validated on read: a corrupted or hand-edited entry is dropped
 * rather than crashing the app or poisoning the cloud on a later merge.
 */

export const STORAGE_KEYS = {
  progress: 'evl.progress.v1',
  settings: 'evl.settings.v1',
  /** Stable id for this browser's dataset, used to make cloud import idempotent. */
  localDatasetId: 'evl.localDatasetId.v1',
  /** Records which account already imported this dataset. */
  importedInto: 'evl.importedInto.v1',
  /** Theme, text size and content width - per browser, never synced. */
  appearance: 'evl.appearance.v1',
} as const;

function readJson(key: string): unknown {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Quota exceeded or storage disabled: surface it rather than failing silently.
    console.warn(`Unable to persist ${key} to localStorage`, error);
  }
}

export function readLocalProgress(): WordProgress[] {
  const raw = readJson(STORAGE_KEYS.progress);
  if (!Array.isArray(raw)) return [];

  const valid: WordProgress[] = [];
  for (const item of raw) {
    const parsed = wordProgressSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

export function writeLocalProgress(progress: WordProgress[]): void {
  writeJson(STORAGE_KEYS.progress, progress);
}

/** A stable per-browser id, created lazily. */
export function localDatasetId(): string {
  if (typeof localStorage === 'undefined') return 'ephemeral-dataset';
  const existing = localStorage.getItem(STORAGE_KEYS.localDatasetId);
  if (existing && existing.length >= 8) return existing;

  const created = `local-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(STORAGE_KEYS.localDatasetId, created);
  } catch {
    /* storage disabled - the id simply will not persist */
  }
  return created;
}

/** Accounts this browser's dataset has already been merged into. */
export function importedAccounts(): string[] {
  const raw = readJson(STORAGE_KEYS.importedInto);
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

export function markImportedInto(userId: string): void {
  const accounts = new Set(importedAccounts());
  accounts.add(userId);
  writeJson(STORAGE_KEYS.importedInto, [...accounts]);
}

export class AnonymousProgressRepository implements ProgressRepository {
  async getAll(): Promise<WordProgress[]> {
    return readLocalProgress();
  }

  async getByWordId(wordId: string): Promise<WordProgress | null> {
    return readLocalProgress().find((item) => item.wordId === wordId) ?? null;
  }

  async upsert(progress: WordProgress): Promise<void> {
    await this.upsertMany([progress]);
  }

  async upsertMany(progress: WordProgress[]): Promise<void> {
    const current = readLocalProgress();
    const map = new Map(current.map((item) => [item.wordId, item]));
    for (const item of progress) map.set(item.wordId, item);
    writeLocalProgress([...map.values()]);
  }

  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.progress);
  }
}

export class AnonymousSettingsRepository implements SettingsRepository {
  async get(): Promise<UserSettings> {
    const raw = readJson(STORAGE_KEYS.settings);
    return raw ? parseSettings(raw) : DEFAULT_SETTINGS;
  }

  async save(settings: UserSettings): Promise<void> {
    writeJson(STORAGE_KEYS.settings, settings);
  }
}
