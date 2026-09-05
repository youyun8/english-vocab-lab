import { describe, expect, it, vi } from 'vitest';

import {
  GITHUB_SCOPE,
  OAuthError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubProfile,
  safeRedirectPath,
} from './github-oauth';

describe('buildAuthorizeUrl', () => {
  const url = () =>
    new URL(
      buildAuthorizeUrl({
        clientId: 'Ov23liTest',
        redirectUri: 'https://app.example.com/api/auth/github/callback',
        state: 'the-state',
      }),
    );

  it('points at GitHub with the right client and redirect', () => {
    const parsed = url();
    expect(parsed.origin).toBe('https://github.com');
    expect(parsed.pathname).toBe('/login/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('Ov23liTest');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://app.example.com/api/auth/github/callback',
    );
  });

  it('always carries the CSRF state', () => {
    expect(url().searchParams.get('state')).toBe('the-state');
  });

  it('requests no scopes at all — identity only', () => {
    expect(GITHUB_SCOPE).toBe('');
    expect(url().searchParams.has('scope')).toBe(false);
  });
});

describe('safeRedirectPath', () => {
  it('defaults to the home page', () => {
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath('')).toBe('/');
  });

  it('allows known in-app paths', () => {
    expect(safeRedirectPath('/words')).toBe('/words');
    expect(safeRedirectPath('/stats')).toBe('/stats');
  });

  it('rejects absolute URLs (open redirect)', () => {
    expect(safeRedirectPath('https://evil.example.com/')).toBe('/');
    expect(safeRedirectPath('http://evil.example.com')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.example.com')).toBe('/');
    expect(safeRedirectPath('//evil.example.com/words')).toBe('/');
  });

  it('rejects paths outside the allowlist', () => {
    expect(safeRedirectPath('/admin')).toBe('/');
    expect(safeRedirectPath('/words/../../etc')).toBe('/');
  });

  it('strips query strings and fragments before checking the allowlist', () => {
    expect(safeRedirectPath('/stats?foo=bar')).toBe('/stats');
    expect(safeRedirectPath('/quiz#top')).toBe('/quiz');
  });

  it('rejects javascript: and data: schemes', () => {
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
    expect(safeRedirectPath('data:text/html,<script>')).toBe('/');
  });
});

describe('exchangeCodeForToken', () => {
  const params = {
    clientId: 'id',
    clientSecret: 'secret',
    code: 'the-code',
    redirectUri: 'https://app.example.com/api/auth/github/callback',
  };

  it('returns the access token on success', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'gho_test', token_type: 'bearer' }), {
        status: 200,
      }),
    );
    await expect(
      exchangeCodeForToken({ ...params, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).resolves.toBe('gho_test');
  });

  it('never puts the client secret in the URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).not.toContain('secret');
      return new Response(JSON.stringify({ access_token: 'gho_test' }), { status: 200 });
    });
    await exchangeCodeForToken({ ...params, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('throws OAuthError when GitHub returns an error body with status 200', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 }),
    );
    await expect(
      exchangeCodeForToken({ ...params, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it('throws OAuthError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(
      exchangeCodeForToken({ ...params, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ reason: 'token_exchange_failed' });
  });
});

describe('fetchGithubProfile', () => {
  it('extracts only the identity fields it needs', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 4242,
          login: 'octocat',
          name: 'The Octocat',
          avatar_url: 'https://example.com/a.png',
          email: 'secret@example.com',
          company: 'GitHub',
        }),
        { status: 200 },
      ),
    );

    const profile = await fetchGithubProfile('gho_test', fetchImpl as unknown as typeof fetch);
    expect(profile).toEqual({
      githubId: 4242,
      githubLogin: 'octocat',
      githubName: 'The Octocat',
      githubAvatarUrl: 'https://example.com/a.png',
    });
    // Email and company must not be carried over.
    expect(Object.keys(profile)).not.toContain('email');
  });

  it('tolerates a missing name and avatar', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: 1, login: 'a', name: null, avatar_url: null }), {
        status: 200,
      }),
    );
    const profile = await fetchGithubProfile('t', fetchImpl as unknown as typeof fetch);
    expect(profile).toEqual({ githubId: 1, githubLogin: 'a' });
  });

  it('throws OAuthError on an unexpected payload', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ login: 'a' }), { status: 200 }));
    await expect(
      fetchGithubProfile('t', fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ reason: 'profile_fetch_failed' });
  });
});
