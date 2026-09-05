import { Hono } from 'hono';

import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';
import type { ServerStats } from '@/shared/api';

const stats = new Hono<AppEnv>();

stats.use('/*', requireAuth);

interface BucketRow {
  key: string | null;
  attempts: number;
  correct: number;
}

interface ActivityRow {
  date: string;
  answered: number;
  correct: number;
}

const RECENT_DAYS = 14;

stats.get('/', async (c) => {
  const userId = c.get('user').id;
  const db = c.env.DB;
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();

  const [totals, byCefr, byType, activity] = await Promise.all([
    db
      .prepare(
        `SELECT
            (SELECT COUNT(*) FROM quiz_attempts
              WHERE user_id = ?1 AND completed_at IS NOT NULL) AS quizzes_completed,
            (SELECT COUNT(*) FROM quiz_answers qa
               JOIN quiz_attempts t ON t.id = qa.quiz_attempt_id
              WHERE t.user_id = ?1) AS answered,
            (SELECT COUNT(*) FROM quiz_answers qa
               JOIN quiz_attempts t ON t.id = qa.quiz_attempt_id
              WHERE t.user_id = ?1 AND qa.correct = 1) AS correct`,
      )
      .bind(userId)
      .first<{ quizzes_completed: number; answered: number; correct: number }>(),

    db
      .prepare(
        `SELECT qa.cefr AS key, COUNT(*) AS attempts, SUM(qa.correct) AS correct
           FROM quiz_answers qa
           JOIN quiz_attempts t ON t.id = qa.quiz_attempt_id
          WHERE t.user_id = ? AND qa.cefr IS NOT NULL
          GROUP BY qa.cefr`,
      )
      .bind(userId)
      .all<BucketRow>(),

    db
      .prepare(
        `SELECT qa.question_type AS key, COUNT(*) AS attempts, SUM(qa.correct) AS correct
           FROM quiz_answers qa
           JOIN quiz_attempts t ON t.id = qa.quiz_attempt_id
          WHERE t.user_id = ? AND qa.question_type IS NOT NULL
          GROUP BY qa.question_type`,
      )
      .bind(userId)
      .all<BucketRow>(),

    db
      .prepare(
        `SELECT substr(qa.answered_at, 1, 10) AS date,
                COUNT(*) AS answered,
                SUM(qa.correct) AS correct
           FROM quiz_answers qa
           JOIN quiz_attempts t ON t.id = qa.quiz_attempt_id
          WHERE t.user_id = ? AND qa.answered_at >= ?
          GROUP BY date
          ORDER BY date ASC`,
      )
      .bind(userId, since)
      .all<ActivityRow>(),
  ]);

  const payload: ServerStats = {
    quizzesCompleted: totals?.quizzes_completed ?? 0,
    totalQuestionsAnswered: totals?.answered ?? 0,
    totalCorrectAnswers: totals?.correct ?? 0,
    accuracyByCefr: toBuckets(byCefr.results ?? []),
    accuracyByQuestionType: toBuckets(byType.results ?? []),
    recentActivity: fillDays(activity.results ?? [], RECENT_DAYS),
  };

  return c.json(payload);
});

function toBuckets(rows: BucketRow[]): Record<string, { attempts: number; correct: number }> {
  const out: Record<string, { attempts: number; correct: number }> = {};
  for (const row of rows) {
    if (!row.key) continue;
    out[row.key] = { attempts: Number(row.attempts), correct: Number(row.correct ?? 0) };
  }
  return out;
}

/** Produces a dense series so the chart has no gaps on days with no activity. */
function fillDays(rows: ActivityRow[], days: number): ActivityRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: ActivityRow[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDate.get(date);
    series.push({
      date,
      answered: Number(row?.answered ?? 0),
      correct: Number(row?.correct ?? 0),
    });
  }
  return series;
}

export default stats;
