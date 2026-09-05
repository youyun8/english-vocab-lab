import { generateId } from '../services/crypto';

export interface QuizAttemptRow {
  id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  total_questions: number;
  correct_answers: number;
}

export interface RecordAnswerInput {
  quizAttemptId: string;
  questionId: string;
  wordId?: string;
  questionType?: string;
  cefr?: string;
  selectedOptionId: string;
  correct: boolean;
  answeredAt: string;
}

export class QuizRepository {
  constructor(private readonly db: D1Database) {}

  async createAttempt(
    userId: string,
    totalQuestions: number,
    now: string,
  ): Promise<QuizAttemptRow> {
    const row: QuizAttemptRow = {
      id: generateId('qa'),
      user_id: userId,
      started_at: now,
      completed_at: null,
      total_questions: totalQuestions,
      correct_answers: 0,
    };

    await this.db
      .prepare(
        `INSERT INTO quiz_attempts
           (id, user_id, started_at, completed_at, total_questions, correct_answers)
         VALUES (?, ?, ?, NULL, ?, 0)`,
      )
      .bind(row.id, row.user_id, row.started_at, row.total_questions)
      .run();

    return row;
  }

  /**
   * Loads an attempt only if it belongs to `userId`. Callers use this before
   * every write so a guessed attempt id from another account resolves to null.
   */
  async findOwnedAttempt(userId: string, attemptId: string): Promise<QuizAttemptRow | null> {
    return this.db
      .prepare('SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ?')
      .bind(attemptId, userId)
      .first<QuizAttemptRow>();
  }

  async recordAnswer(input: RecordAnswerInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO quiz_answers
           (id, quiz_attempt_id, question_id, word_id, question_type, cefr,
            selected_option_id, correct, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId('qan'),
        input.quizAttemptId,
        input.questionId,
        input.wordId ?? null,
        input.questionType ?? null,
        input.cefr ?? null,
        input.selectedOptionId,
        input.correct ? 1 : 0,
        input.answeredAt,
      )
      .run();
  }

  async completeAttempt(
    userId: string,
    attemptId: string,
    correctAnswers: number,
    now: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE quiz_attempts
            SET completed_at = ?, correct_answers = ?
          WHERE id = ? AND user_id = ?`,
      )
      .bind(now, correctAnswers, attemptId, userId)
      .run();
  }

  async listAttempts(userId: string, limit = 20): Promise<QuizAttemptRow[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM quiz_attempts
          WHERE user_id = ?
          ORDER BY started_at DESC
          LIMIT ?`,
      )
      .bind(userId, limit)
      .all<QuizAttemptRow>();
    return result.results ?? [];
  }
}
