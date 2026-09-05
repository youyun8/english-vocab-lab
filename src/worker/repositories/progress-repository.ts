import type { LearningStatus, WordProgress } from '@/domain/progress';

export interface WordProgressRow {
  user_id: string;
  word_id: string;
  status: LearningStatus;
  bookmarked: number;
  difficult: number;
  times_seen: number;
  quiz_attempts: number;
  correct_answers: number;
  mistake_count: number;
  review_streak: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  updated_at: string;
}

export function rowToProgress(row: WordProgressRow): WordProgress {
  return {
    wordId: row.word_id,
    status: row.status,
    bookmarked: row.bookmarked === 1,
    difficult: row.difficult === 1,
    timesSeen: row.times_seen,
    quizAttempts: row.quiz_attempts,
    correctAnswers: row.correct_answers,
    mistakeCount: row.mistake_count,
    reviewStreak: row.review_streak,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

/**
 * Every method takes `userId` as its first argument and includes it in the
 * WHERE clause. There is no code path that reads or writes progress without
 * scoping to the session-derived user, which is what enforces isolation.
 */
export class ProgressRepository {
  constructor(private readonly db: D1Database) {}

  async listByUser(userId: string): Promise<WordProgress[]> {
    const result = await this.db
      .prepare('SELECT * FROM word_progress WHERE user_id = ? ORDER BY word_id')
      .bind(userId)
      .all<WordProgressRow>();
    return (result.results ?? []).map(rowToProgress);
  }

  async listDue(userId: string, now: Date): Promise<WordProgress[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM word_progress
          WHERE user_id = ? AND next_review_at IS NOT NULL AND next_review_at <= ?
          ORDER BY next_review_at ASC`,
      )
      .bind(userId, now.toISOString())
      .all<WordProgressRow>();
    return (result.results ?? []).map(rowToProgress);
  }

  async getByWordId(userId: string, wordId: string): Promise<WordProgress | null> {
    const row = await this.db
      .prepare('SELECT * FROM word_progress WHERE user_id = ? AND word_id = ?')
      .bind(userId, wordId)
      .first<WordProgressRow>();
    return row ? rowToProgress(row) : null;
  }

  private upsertStatement(userId: string, progress: WordProgress): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO word_progress
           (user_id, word_id, status, bookmarked, difficult, times_seen, quiz_attempts,
            correct_answers, mistake_count, review_streak, last_reviewed_at,
            next_review_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, word_id) DO UPDATE SET
           status           = excluded.status,
           bookmarked       = excluded.bookmarked,
           difficult        = excluded.difficult,
           times_seen       = excluded.times_seen,
           quiz_attempts    = excluded.quiz_attempts,
           correct_answers  = excluded.correct_answers,
           mistake_count    = excluded.mistake_count,
           review_streak    = excluded.review_streak,
           last_reviewed_at = excluded.last_reviewed_at,
           next_review_at   = excluded.next_review_at,
           updated_at       = excluded.updated_at`,
      )
      .bind(
        userId,
        progress.wordId,
        progress.status,
        progress.bookmarked ? 1 : 0,
        progress.difficult ? 1 : 0,
        progress.timesSeen,
        progress.quizAttempts,
        progress.correctAnswers,
        progress.mistakeCount,
        progress.reviewStreak,
        progress.lastReviewedAt ?? null,
        progress.nextReviewAt ?? null,
        progress.updatedAt,
      );
  }

  async upsert(userId: string, progress: WordProgress): Promise<void> {
    await this.upsertStatement(userId, progress).run();
  }

  async upsertMany(userId: string, progress: WordProgress[]): Promise<void> {
    if (progress.length === 0) return;
    // D1 batches run inside a single implicit transaction.
    const CHUNK = 50;
    for (let i = 0; i < progress.length; i += CHUNK) {
      const chunk = progress.slice(i, i + CHUNK);
      await this.db.batch(chunk.map((item) => this.upsertStatement(userId, item)));
    }
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM word_progress WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM progress_imports WHERE user_id = ?').bind(userId),
      this.db
        .prepare(
          `DELETE FROM quiz_answers
            WHERE quiz_attempt_id IN (SELECT id FROM quiz_attempts WHERE user_id = ?)`,
        )
        .bind(userId),
      this.db.prepare('DELETE FROM quiz_attempts WHERE user_id = ?').bind(userId),
    ]);
  }

  // --- import idempotency -------------------------------------------------

  async hasImported(userId: string, importId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT 1 AS ok FROM progress_imports WHERE user_id = ? AND import_id = ?')
      .bind(userId, importId)
      .first<{ ok: number }>();
    return row != null;
  }

  async recordImport(userId: string, importId: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO progress_imports (user_id, import_id, imported_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, import_id) DO NOTHING`,
      )
      .bind(userId, importId, now)
      .run();
  }
}
