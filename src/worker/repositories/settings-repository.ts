export class SettingsRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: string): Promise<unknown | null> {
    const row = await this.db
      .prepare('SELECT settings_json FROM user_settings WHERE user_id = ?')
      .bind(userId)
      .first<{ settings_json: string }>();

    if (!row) return null;
    try {
      return JSON.parse(row.settings_json) as unknown;
    } catch {
      // A corrupted row should not break the app; the caller falls back to
      // defaults and the next save overwrites it.
      return null;
    }
  }

  async save(userId: string, settings: unknown, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO user_settings (user_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at    = excluded.updated_at`,
      )
      .bind(userId, JSON.stringify(settings), now)
      .run();
  }
}
