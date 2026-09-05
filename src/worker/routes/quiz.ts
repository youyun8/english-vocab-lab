import { Hono } from 'hono';

import { API_ERROR_CODES, quizAnswerSchema, quizCompleteSchema, quizStartSchema } from '@/shared/api';
import { requireAuth } from '../middleware/auth';
import { errorBody } from '../middleware/error-handler';
import { QuizRepository } from '../repositories/quiz-repository';
import type { AppEnv } from '../types';

const quiz = new Hono<AppEnv>();

quiz.use('/*', requireAuth);

quiz.post('/', async (c) => {
  const parsed = quizStartSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(errorBody(API_ERROR_CODES.validationFailed, 'Invalid quiz payload.'), 400);
  }

  const attempt = await new QuizRepository(c.env.DB).createAttempt(
    c.get('user').id,
    parsed.data.totalQuestions,
    new Date().toISOString(),
  );

  return c.json({ quizId: attempt.id, startedAt: attempt.started_at });
});

quiz.get('/', async (c) => {
  const attempts = await new QuizRepository(c.env.DB).listAttempts(c.get('user').id);
  return c.json(
    attempts.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalQuestions: row.total_questions,
      correctAnswers: row.correct_answers,
    })),
  );
});

quiz.post('/:quizId/answer', async (c) => {
  const parsed = quizAnswerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(errorBody(API_ERROR_CODES.validationFailed, 'Invalid answer payload.'), 400);
  }

  const repo = new QuizRepository(c.env.DB);
  // Ownership check: an attempt id belonging to another account resolves to
  // null here and the request is rejected as not found.
  const attempt = await repo.findOwnedAttempt(c.get('user').id, c.req.param('quizId'));
  if (!attempt) {
    return c.json(errorBody(API_ERROR_CODES.notFound, 'Quiz attempt not found.'), 404);
  }

  await repo.recordAnswer({
    quizAttemptId: attempt.id,
    questionId: parsed.data.questionId,
    ...(parsed.data.wordId ? { wordId: parsed.data.wordId } : {}),
    ...(parsed.data.questionType ? { questionType: parsed.data.questionType } : {}),
    ...(parsed.data.cefr ? { cefr: parsed.data.cefr } : {}),
    selectedOptionId: parsed.data.selectedOptionId,
    correct: parsed.data.correct,
    answeredAt: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

quiz.post('/:quizId/complete', async (c) => {
  const parsed = quizCompleteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(errorBody(API_ERROR_CODES.validationFailed, 'Invalid completion payload.'), 400);
  }

  const repo = new QuizRepository(c.env.DB);
  const attempt = await repo.findOwnedAttempt(c.get('user').id, c.req.param('quizId'));
  if (!attempt) {
    return c.json(errorBody(API_ERROR_CODES.notFound, 'Quiz attempt not found.'), 404);
  }

  if (parsed.data.correctAnswers > attempt.total_questions) {
    return c.json(
      errorBody(API_ERROR_CODES.validationFailed, 'correctAnswers exceeds the quiz length.'),
      400,
    );
  }

  await repo.completeAttempt(
    c.get('user').id,
    attempt.id,
    parsed.data.correctAnswers,
    new Date().toISOString(),
  );

  return c.json({ ok: true });
});

export default quiz;
