import { generateId, generateToken, hashToken } from '../services/crypto';
import type { UserRow } from './user-repository';

export interface SessionRow {
  id: string;
  session_token_hash: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export const SESSION_TTL_DAYS = 30;
export const OAUTH_STATE_TTL_MINUTES = 10;

export class SessionRepository {
  constructor(private readonly db: D1Database) {}

  /**
   * Issues a brand-new session. A fresh row (and therefore a fresh token) is
   * always created on login, which is what makes session fixation impossible:
   * a token supplied by an attacker before login is never adopted afterwards.
   */
  async create(userId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);

    await this.db
      .prepare(
        `INSERT INTO sessions (id, session_token_hash, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId('ses'),
        await hashToken(token),
        userId,
        now.toISOString(),
        expiresAt.toISOString(),
      )
      .run();

    return { token, expiresAt };
  }

  /** Resolves a raw token to its user, or null when missing/expired. */
  async resolve(token: string, now: Date): Promise<UserRow | null> {
    const row = await this.db
      .prepare(
        `SELECT u.*, s.expires_at AS session_expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.session_token_hash = ?`,
      )
      .bind(await hashToken(token))
      .first<UserRow & { session_expires_at: string }>();

    if (!row) return null;

    if (Date.parse(row.session_expires_at) <= now.getTime()) {
      await this.revoke(token);
      return null;
    }

    const { session_expires_at: _expires, ...user } = row;
    return user;
  }

  async revoke(token: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM sessions WHERE session_token_hash = ?')
      .bind(await hashToken(token))
      .run();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  }

  /** Opportunistic cleanup so expired rows do not accumulate forever. */
  async deleteExpired(now: Date): Promise<void> {
    const iso = now.toISOString();
    await this.db.batch([
      this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(iso),
      this.db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(iso),
    ]);
  }

  // --- OAuth state -------------------------------------------------------

  async createOAuthState(now: Date): Promise<string> {
    const state = generateToken();
    const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MINUTES * 60_000);
    await this.db
      .prepare('INSERT INTO oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)')
      .bind(state, now.toISOString(), expiresAt.toISOString())
      .run();
    return state;
  }

  /**
   * Consumes a state value exactly once. The DELETE ... RETURNING is atomic, so
   * two concurrent callbacks carrying the same state cannot both succeed.
   */
  async consumeOAuthState(state: string, now: Date): Promise<boolean> {
    const row = await this.db
      .prepare('DELETE FROM oauth_states WHERE state = ? RETURNING expires_at')
      .bind(state)
      .first<{ expires_at: string }>();

    if (!row) return false;
    return Date.parse(row.expires_at) > now.getTime();
  }
}
