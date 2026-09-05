import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { useAuth } from './auth-context';

function AuthProbe() {
  const { status, user, signOut } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="login">{user?.githubLogin ?? '—'}</p>
      <button type="button" onClick={() => void signOut()}>
        登出
      </button>
    </div>
  );
}

const AUTHENTICATED_USER = {
  id: 'usr_1',
  githubId: 4242,
  githubLogin: 'octocat',
  githubName: 'The Octocat',
  githubAvatarUrl: 'https://example.com/a.png',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

describe('auth state', () => {
  it('reports anonymous when the API says so', async () => {
    mockApi(ANONYMOUS_API);
    renderWithProviders(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(screen.getByTestId('login')).toHaveTextContent('—');
  });

  it('reports the signed-in user', async () => {
    mockApi({
      '/api/auth/me': { authenticated: true, user: AUTHENTICATED_USER },
      '/api/progress': [],
      '/api/settings': null,
    });
    renderWithProviders(<AuthProbe />);

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('login')).toHaveTextContent('octocat');
  });

  it('treats a 401 as anonymous rather than an error', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    renderWithProviders(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  });

  it('reports "unavailable" when the API cannot be reached', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network down');
    }) as typeof fetch;

    renderWithProviders(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
  });

  it('returns to the anonymous state after signing out', async () => {
    const user = userEvent.setup();
    const logout = vi.fn();

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/auth/logout')) {
        logout();
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({ authenticated: true, user: AUTHENTICATED_USER }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderWithProviders(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await user.click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('never exposes a session token to JavaScript', async () => {
    mockApi({ '/api/auth/me': { authenticated: true, user: AUTHENTICATED_USER }, '/api/progress': [] });
    renderWithProviders(<AuthProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    // Nothing token-like is written to web storage by the auth layer.
    const keys = Object.keys(localStorage);
    expect(keys.some((key) => key.toLowerCase().includes('token'))).toBe(false);
    expect(keys.some((key) => key.toLowerCase().includes('session'))).toBe(false);
  });
});
