import { describe, expect, it } from 'vitest';

import type { Env } from '../env';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  buildCookie,
  clearCookie,
  oauthStateCookie,
  parseCookies,
  readCookie,
  sessionCookie,
  verifyOAuthStateCookie,
} from './session';

function env(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as never,
    ASSETS: {} as never,
    GITHUB_CLIENT_ID: 'id',
    GITHUB_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'a'.repeat(64),
    APP_URL: 'https://app.example.com',
    ...overrides,
  };
}

const NOW = new Date('2026-03-01T00:00:00.000Z');
const EXPIRES = new Date('2026-03-31T00:00:00.000Z');

describe('session cookie flags', () => {
  it('is HttpOnly, SameSite=Lax, Path=/ and Secure in production', () => {
    const cookie = sessionCookie(env(), 'raw-token', EXPIRES, NOW);
    expect(cookie).toContain(`${SESSION_COOKIE}=raw-token`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
  });

  it('omits Secure in local development so http://localhost still works', () => {
    const cookie = sessionCookie(env({ ENVIRONMENT: 'development' }), 't', EXPIRES, NOW);
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });

  it('sets Max-Age from the session expiry', () => {
    const cookie = sessionCookie(env(), 't', EXPIRES, NOW);
    const expected = Math.floor((EXPIRES.getTime() - NOW.getTime()) / 1000);
    expect(cookie).toContain(`Max-Age=${expected}`);
  });

  it('never produces a negative Max-Age for an already-expired session', () => {
    const cookie = sessionCookie(env(), 't', new Date(NOW.getTime() - 1000), NOW);
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('clearCookie', () => {
  it('expires the cookie immediately and keeps HttpOnly', () => {
    const cookie = clearCookie(SESSION_COOKIE, true);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });
});

describe('parseCookies / readCookie', () => {
  it('parses a multi-cookie header', () => {
    expect(parseCookies('a=1; b=two; c=%2Fpath')).toEqual({ a: '1', b: 'two', c: '/path' });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookies(null)).toEqual({});
  });

  it('ignores malformed segments instead of throwing', () => {
    expect(parseCookies('novalue; a=1')).toEqual({ a: '1' });
  });

  it('reads a named cookie off a Request', () => {
    const request = new Request('https://app.example.com/', {
      headers: { Cookie: `${SESSION_COOKIE}=tok; other=1` },
    });
    expect(readCookie(request, SESSION_COOKIE)).toBe('tok');
    expect(readCookie(request, 'missing')).toBeNull();
  });
});

describe('OAuth state cookie', () => {
  it('is short-lived, HttpOnly and signed with the session secret', async () => {
    const cookie = await oauthStateCookie(env(), 'state-value');
    expect(cookie).toContain(`${OAUTH_STATE_COOKIE}=state-value.`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=600');
  });

  it('accepts a cookie it minted for the matching state', async () => {
    const cookie = await oauthStateCookie(env(), 'state-value');
    const value = cookie.split(';')[0]!.split('=').slice(1).join('=');
    await expect(verifyOAuthStateCookie(env(), value, 'state-value')).resolves.toBe(true);
  });

  it('rejects a missing cookie', async () => {
    await expect(verifyOAuthStateCookie(env(), null, 'state-value')).resolves.toBe(false);
  });

  it('rejects a state that does not match the cookie (login CSRF)', async () => {
    const cookie = await oauthStateCookie(env(), 'state-value');
    const value = cookie.split(';')[0]!.split('=').slice(1).join('=');
    await expect(verifyOAuthStateCookie(env(), value, 'attacker-state')).resolves.toBe(false);
  });

  it('rejects a forged signature', async () => {
    await expect(
      verifyOAuthStateCookie(env(), 'state-value.deadbeef', 'state-value'),
    ).resolves.toBe(false);
  });

  it('rejects a cookie signed with a different secret', async () => {
    const cookie = await oauthStateCookie(env({ SESSION_SECRET: 'b'.repeat(64) }), 'state-value');
    const value = cookie.split(';')[0]!.split('=').slice(1).join('=');
    await expect(verifyOAuthStateCookie(env(), value, 'state-value')).resolves.toBe(false);
  });

  it('rejects a cookie with no signature separator', async () => {
    await expect(verifyOAuthStateCookie(env(), 'nosignature', 'nosignature')).resolves.toBe(false);
  });
});

describe('buildCookie', () => {
  it('always sets HttpOnly and Path=/', () => {
    const cookie = buildCookie('x', 'y', { maxAgeSeconds: 60, secure: false });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
  });
});
