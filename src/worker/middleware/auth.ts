import type { MiddlewareHandler } from 'hono';

import { API_ERROR_CODES } from '@/shared/api';
import { errorBody } from './error-handler';
import { SessionRepository } from '../repositories/session-repository';
import { SESSION_COOKIE, readCookie } from '../services/session';
import type { AppEnv } from '../types';
import type { UserRow } from '../repositories/user-repository';

/**
 * Resolves the authenticated user from the session cookie.
 *
 * The user id is NEVER read from the request body, a query parameter or a
 * header. Every authenticated route obtains its identity here, which is what
 * makes cross-user access impossible by construction.
 */
export async function resolveUser(
  db: D1Database,
  request: Request,
  now: Date,
): Promise<UserRow | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return new SessionRepository(db).resolve(token, now);
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await resolveUser(c.env.DB, c.req.raw, new Date());
  if (!user) {
    return c.json(
      errorBody(API_ERROR_CODES.unauthorized, 'You must sign in to use this endpoint.'),
      401,
    );
  }
  c.set('user', user);
  await next();
};
