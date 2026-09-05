import { Hono } from 'hono';

import { DEFAULT_SETTINGS, userSettingsSchema } from '@/domain/settings';
import { API_ERROR_CODES } from '@/shared/api';
import { requireAuth } from '../middleware/auth';
import { errorBody } from '../middleware/error-handler';
import { SettingsRepository } from '../repositories/settings-repository';
import type { AppEnv } from '../types';

const settings = new Hono<AppEnv>();

settings.use('/*', requireAuth);

settings.get('/', async (c) => {
  const stored = await new SettingsRepository(c.env.DB).get(c.get('user').id);
  const parsed = userSettingsSchema.safeParse(stored);
  return c.json(parsed.success ? parsed.data : DEFAULT_SETTINGS);
});

settings.put('/', async (c) => {
  const parsed = userSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(errorBody(API_ERROR_CODES.validationFailed, 'Invalid settings payload.'), 400);
  }

  await new SettingsRepository(c.env.DB).save(
    c.get('user').id,
    parsed.data,
    new Date().toISOString(),
  );
  return c.json(parsed.data);
});

export default settings;
