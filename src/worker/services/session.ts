import { hmac, timingSafeEqual } from './crypto';
import type { Env } from '../env';
import { isProduction } from '../env';

export const SESSION_COOKIE = 'evl_session';
export const OAUTH_STATE_COOKIE = 'evl_oauth_state';

interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
  sameSite?: 'Lax' | 'Strict';
}

/**
 * Session cookies are HttpOnly (invisible to JavaScript), SameSite=Lax (so a
 * cross-site POST cannot carry them, while the OAuth redirect still works) and
 * Secure in production.
 */
export function buildCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${options.sameSite ?? 'Lax'}`,
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name: string, secure: boolean): string {
  return buildCookie(name, '', { maxAgeSeconds: 0, secure });
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

export function readCookie(request: Request, name: string): string | null {
  return parseCookies(request.headers.get('Cookie'))[name] ?? null;
}

export function sessionCookie(env: Env, token: string, expiresAt: Date, now: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return buildCookie(SESSION_COOKIE, token, {
    maxAgeSeconds: maxAge,
    secure: isProduction(env),
  });
}

/**
 * The OAuth state cookie carries `state.signature`. Verifying the signature
 * proves the value was minted by this server, and comparing it with the state
 * in the callback URL proves the flow was started in *this* browser - which is
 * what defeats login CSRF, on top of the single-use database check.
 */
export async function oauthStateCookie(env: Env, state: string): Promise<string> {
  const signature = await hmac(env.SESSION_SECRET, state);
  return buildCookie(OAUTH_STATE_COOKIE, `${state}.${signature}`, {
    maxAgeSeconds: 600,
    secure: isProduction(env),
  });
}

export async function verifyOAuthStateCookie(
  env: Env,
  cookieValue: string | null,
  stateFromQuery: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0) return false;

  const state = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);

  if (!timingSafeEqual(state, stateFromQuery)) return false;
  const expected = await hmac(env.SESSION_SECRET, state);
  return timingSafeEqual(signature, expected);
}
