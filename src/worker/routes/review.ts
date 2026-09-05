import { Hono } from 'hono';

import { rankByWeakness } from '@/domain/review';
import { requireAuth } from '../middleware/auth';
import { ProgressRepository } from '../repositories/progress-repository';
import type { AppEnv } from '../types';

const review = new Hono<AppEnv>();

review.use('/*', requireAuth);

/** Words whose scheduled review time has arrived, most overdue first. */
review.get('/due', async (c) => {
  const now = new Date();
  const items = await new ProgressRepository(c.env.DB).listDue(c.get('user').id, now);
  return c.json(items);
});

/** Weakest words first, ranked by the shared deterministic scoring function. */
review.get('/weak', async (c) => {
  const now = new Date();
  const all = await new ProgressRepository(c.env.DB).listByUser(c.get('user').id);
  return c.json(rankByWeakness(all, now).slice(0, 50));
});

export default review;
