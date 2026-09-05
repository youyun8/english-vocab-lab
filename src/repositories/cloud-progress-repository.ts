import type { WordProgress } from '@/domain/progress';
import { DEFAULT_SETTINGS, userSettingsSchema, type UserSettings } from '@/domain/settings';
import { apiFetch } from '@/services/api-client';
import { wordProgressSchema } from '@/domain/progress';
import type { ProgressRepository, SettingsRepository } from './progress-repository';

/** D1-backed persistence for signed-in learners, via the Worker API. */
export class CloudProgressRepository implements ProgressRepository {
  async getAll(): Promise<WordProgress[]> {
    const data = await apiFetch<unknown>('/api/progress');
    if (!Array.isArray(data)) return [];
    const valid: WordProgress[] = [];
    for (const item of data) {
      const parsed = wordProgressSchema.safeParse(item);
      if (parsed.success) valid.push(parsed.data);
    }
    return valid;
  }

  async getByWordId(wordId: string): Promise<WordProgress | null> {
    const data = await apiFetch<unknown>(`/api/progress/${encodeURIComponent(wordId)}`);
    const parsed = wordProgressSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  }

  async upsert(progress: WordProgress): Promise<void> {
    await apiFetch(`/api/progress/${encodeURIComponent(progress.wordId)}`, {
      method: 'PUT',
      body: JSON.stringify(progress),
    });
  }

  async upsertMany(progress: WordProgress[]): Promise<void> {
    // The API is per-word; sequential writes keep ordering deterministic and
    // avoid hammering D1 with a burst of parallel statements.
    for (const item of progress) {
      await this.upsert(item);
    }
  }

  async clear(): Promise<void> {
    await apiFetch('/api/progress', { method: 'DELETE' });
  }
}

export class CloudSettingsRepository implements SettingsRepository {
  async get(): Promise<UserSettings> {
    const data = await apiFetch<unknown>('/api/settings');
    const parsed = userSettingsSchema.safeParse(data);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  }

  async save(settings: UserSettings): Promise<void> {
    await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }
}
