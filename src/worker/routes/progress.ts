import { Hono } from 'hono';

import { createEmptyProgress, wordProgressSchema } from '@/domain/progress';
import { mergeProgressSets } from '@/services/progress-merge';
import { API_ERROR_CODES, progressImportSchema } from '@/shared/api';
import { requireAuth } from '../middleware/auth';
import { errorBody } from '../middleware/error-handler';
import { ProgressRepository } from '../repositories/progress-repository';
import { SettingsRepository } from '../repositories/settings-repository';
import type { AppEnv } from '../types';

const progress = new Hono<AppEnv>();

progress.use('/*', requireAuth);

progress.get('/', async (c) => {
  const repo = new ProgressRepository(c.env.DB);
  return c.json(await repo.listByUser(c.get('user').id));
});

progress.delete('/', async (c) => {
  await new ProgressRepository(c.env.DB).deleteAllForUser(c.get('user').id);
  return c.body(null, 204);
});

progress.get('/:wordId', async (c) => {
  const wordId = c.req.param('wordId');
  const repo = new ProgressRepository(c.env.DB);
  const item = await repo.getByWordId(c.get('user').id, wordId);
  if (!item) {
    return c.json(errorBody(API_ERROR_CODES.notFound, 'No progress recorded for this word.'), 404);
  }
  return c.json(item);
});

progress.put('/:wordId', async (c) => {
  const wordId = c.req.param('wordId');
  const body: unknown = await c.req.json().catch(() => null);

  // The path parameter is authoritative: a mismatched wordId in the body must
  // never let a client write to a different row.
  const parsed = wordProgressSchema.safeParse(
    typeof body === 'object' && body !== null ? { ...body, wordId } : body,
  );
  if (!parsed.success) {
    return c.json(
      errorBody(API_ERROR_CODES.validationFailed, 'Invalid progress payload.', flatten(parsed.error.issues)),
      400,
    );
  }

  const record = parsed.data;
  if (record.correctAnswers > record.quizAttempts) {
    return c.json(
      errorBody(API_ERROR_CODES.validationFailed, 'correctAnswers cannot exceed quizAttempts.'),
      400,
    );
  }

  await new ProgressRepository(c.env.DB).upsert(c.get('user').id, record);
  return c.json(record);
});

/**
 * First-login merge. Idempotent by `importId`: replaying the same request is a
 * no-op, so a retried network call can never double-count local progress.
 */
progress.post('/import-local', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = progressImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      errorBody(API_ERROR_CODES.validationFailed, 'Invalid import payload.', flatten(parsed.error.issues)),
      400,
    );
  }

  const userId = c.get('user').id;
  const repo = new ProgressRepository(c.env.DB);
  const now = new Date().toISOString();

  if (await repo.hasImported(userId, parsed.data.importId)) {
    return c.json({ imported: false, alreadyImported: true, merged: 0, created: 0, updated: 0 });
  }

  const cloud = await repo.listByUser(userId);
  const local = parsed.data.progress.map((item) => ({
    ...createEmptyProgress(item.wordId, item.updatedAt),
    ...item,
  }));

  const result = mergeProgressSets(local, cloud);
  await repo.upsertMany(userId, result.merged);
  await repo.recordImport(userId, parsed.data.importId, now);

  if (parsed.data.settings) {
    await new SettingsRepository(c.env.DB).save(userId, parsed.data.settings, now);
  }

  return c.json({
    imported: true,
    alreadyImported: false,
    merged: result.merged.length,
    created: result.created,
    updated: result.updated,
  });
});

function flatten(issues: { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

export default progress;
