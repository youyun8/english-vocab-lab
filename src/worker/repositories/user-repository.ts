import { generateId } from '../services/crypto';

export interface UserRow {
  id: string;
  github_id: number;
  github_login: string;
  github_name: string | null;
  github_avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GithubIdentity {
  githubId: number;
  githubLogin: string;
  githubName?: string;
  githubAvatarUrl?: string;
}

/** All statements are prepared and parameter-bound; no SQL is ever concatenated. */
export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<UserRow | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
  }

  /**
   * Creates the user on first login, or refreshes the cached GitHub profile on
   * subsequent logins. Keyed on the immutable numeric GitHub id.
   */
  async upsertByGithubIdentity(identity: GithubIdentity, now: string): Promise<UserRow> {
    const existing = await this.db
      .prepare('SELECT * FROM users WHERE github_id = ?')
      .bind(identity.githubId)
      .first<UserRow>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE users
              SET github_login = ?, github_name = ?, github_avatar_url = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          identity.githubLogin,
          identity.githubName ?? null,
          identity.githubAvatarUrl ?? null,
          now,
          existing.id,
        )
        .run();

      return {
        ...existing,
        github_login: identity.githubLogin,
        github_name: identity.githubName ?? null,
        github_avatar_url: identity.githubAvatarUrl ?? null,
        updated_at: now,
      };
    }

    const row: UserRow = {
      id: generateId('usr'),
      github_id: identity.githubId,
      github_login: identity.githubLogin,
      github_name: identity.githubName ?? null,
      github_avatar_url: identity.githubAvatarUrl ?? null,
      created_at: now,
      updated_at: now,
    };

    await this.db
      .prepare(
        `INSERT INTO users
           (id, github_id, github_login, github_name, github_avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.github_id,
        row.github_login,
        row.github_name,
        row.github_avatar_url,
        row.created_at,
        row.updated_at,
      )
      .run();

    return row;
  }
}
