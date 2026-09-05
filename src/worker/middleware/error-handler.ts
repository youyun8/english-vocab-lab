import type { Context, ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

import { API_ERROR_CODES, type ApiError, type ApiErrorCode } from '@/shared/api';
import type { AppEnv } from '../types';
import { isProduction } from '../env';

export function errorBody(
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, string[]>,
): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}

/**
 * Single place where errors become responses. Internal errors are logged
 * server-side but never leak a stack trace or message to the client in
 * production.
 */
export const onError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof HTTPException) {
    const response = error.getResponse();
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      return response;
    }
    const code =
      error.status === 401
        ? API_ERROR_CODES.unauthorized
        : error.status === 403
          ? API_ERROR_CODES.forbidden
          : error.status === 404
            ? API_ERROR_CODES.notFound
            : API_ERROR_CODES.badRequest;
    return c.json(errorBody(code, error.message), error.status);
  }

  if (error instanceof ZodError) {
    return c.json(
      errorBody(API_ERROR_CODES.validationFailed, 'Request validation failed', zodDetails(error)),
      400,
    );
  }

  console.error('Unhandled worker error', error);

  const message = isProduction(c.env)
    ? 'An unexpected error occurred.'
    : error instanceof Error
      ? error.message
      : String(error);

  return c.json(errorBody(API_ERROR_CODES.internal, message), 500);
};

export const onNotFound: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorBody(API_ERROR_CODES.notFound, 'The requested endpoint does not exist.'), 404);

/** Adds baseline security headers to every API response. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cache-Control', 'no-store');
};

export function json<T>(c: Context<AppEnv>, data: T, status = 200) {
  return c.json(data as never, status as never);
}
