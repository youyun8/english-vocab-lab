import { describe, expect, it } from 'vitest';

import { normalizeAppUrl, requireOAuthConfig, resolveAppUrl, type Env } from './env';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env['DB'],
    ASSETS: {} as Env['ASSETS'],
    GITHUB_CLIENT_ID: 'Ov23liTest',
    GITHUB_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'a'.repeat(64),
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

const request = (url: string) => new Request(url);

describe('normalizeAppUrl', () => {
  it('keeps a plain origin as it is', () => {
    expect(normalizeAppUrl('https://vocab.example.com')).toBe('https://vocab.example.com');
  });

  it('drops trailing slashes, paths and query strings', () => {
    expect(normalizeAppUrl('https://vocab.example.com/')).toBe('https://vocab.example.com');
    expect(normalizeAppUrl('https://vocab.example.com/app?x=1')).toBe(
      'https://vocab.example.com',
    );
  });

  it('keeps a non-default port', () => {
    expect(normalizeAppUrl('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('rejects a value that is not an absolute http(s) URL', () => {
    expect(() => normalizeAppUrl('vocab.example.com')).toThrow(/absolute URL/);
    expect(() => normalizeAppUrl('ftp://vocab.example.com')).toThrow(/http or https/);
  });
});

describe('resolveAppUrl', () => {
  it('falls back to the origin of the request when APP_URL is unset', () => {
    expect(resolveAppUrl(makeEnv(), request('https://worker.workers.dev/api/auth/github'))).toEqual(
      { appUrl: 'https://worker.workers.dev', source: 'request' },
    );
  });

  it('treats a blank APP_URL as unset', () => {
    const resolved = resolveAppUrl(
      makeEnv({ APP_URL: '   ' }),
      request('http://localhost:5173/api/auth/github'),
    );
    expect(resolved).toEqual({ appUrl: 'http://localhost:5173', source: 'request' });
  });

  it('prefers a configured APP_URL over the request origin', () => {
    const resolved = resolveAppUrl(
      makeEnv({ APP_URL: 'https://vocab.example.com/' }),
      request('https://worker.workers.dev/api/auth/github'),
    );
    expect(resolved).toEqual({ appUrl: 'https://vocab.example.com', source: 'APP_URL' });
  });
});

describe('requireOAuthConfig', () => {
  it('no longer requires APP_URL', () => {
    const config = requireOAuthConfig(makeEnv(), request('https://worker.workers.dev/api/auth/github'));
    expect(config.appUrl).toBe('https://worker.workers.dev');
    expect(config.appUrlSource).toBe('request');
  });

  it('names every missing secret at once', () => {
    expect(() =>
      requireOAuthConfig(
        makeEnv({ GITHUB_CLIENT_ID: '', SESSION_SECRET: '' }),
        request('https://worker.workers.dev/api/auth/github'),
      ),
    ).toThrow('Missing required configuration: GITHUB_CLIENT_ID, SESSION_SECRET');
  });
});
