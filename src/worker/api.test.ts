import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { createTestD1, type TestDatabase } from '@/test/d1';
import app from './index';
import type { Env } from './env';
import { SessionRepository } from './repositories/session-repository';
import { UserRepository } from './repositories/user-repository';
import { SESSION_COOKIE } from './services/session';

/**
 * End-to-end API tests against the real migration, executed on an in-memory
 * SQLite database through a D1-compatible adapter. The `user_id` predicates
 * that enforce isolation are therefore genuinely exercised, not mocked away.
 */

let database: TestDatabase;
let env: Env;

const NOW = new Date('2026-03-01T00:00:00.000Z');

beforeEach(() => {
  database = createTestD1();
  env = {
    DB: database.db as Env['DB'],
    ASSETS: {} as Env['ASSETS'],
    GITHUB_CLIENT_ID: 'Ov23liTest',
    GITHUB_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'a'.repeat(64),
    APP_URL: 'https://app.example.com',
    ENVIRONMENT: 'test',
  };
});

afterEach(() => {
  database.close();
});

async function createUserWithSession(githubId: number, login: string) {
  const users = new UserRepository(env.DB);
  const sessions = new SessionRepository(env.DB);
  const user = await users.upsertByGithubIdentity(
    { githubId, githubLogin: login },
    NOW.toISOString(),
  );
  // Sessions must be created against real time: the auth middleware validates
  // expiry with `new Date()`, so a fixture dated in the past would be expired.
  const { token } = await sessions.create(user.id, new Date());
  return { user, token };
}

function request(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set('Cookie', `${SESSION_COOKIE}=${token}`);
  if (rest.body) headers.set('Content-Type', 'application/json');

  return Promise.resolve(
    app.fetch(new Request(`https://app.example.com${path}`, { ...rest, headers }), env),
  );
}

function progressFor(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress(wordId, NOW.toISOString()), ...overrides };
}

// ---------------------------------------------------------------------------

describe('unauthenticated access', () => {
  const protectedEndpoints: [string, string][] = [
    ['GET', '/api/progress'],
    ['GET', '/api/progress/w_consolidate'],
    ['PUT', '/api/progress/w_consolidate'],
    ['DELETE', '/api/progress'],
    ['POST', '/api/progress/import-local'],
    ['GET', '/api/review/due'],
    ['GET', '/api/review/weak'],
    ['POST', '/api/quiz'],
    ['GET', '/api/quiz'],
    ['GET', '/api/stats'],
    ['GET', '/api/settings'],
    ['PUT', '/api/settings'],
  ];

  it.each(protectedEndpoints)('rejects %s %s with 401', async (method, path) => {
    const response = await request(path, { method, ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }) });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthorized');
  });

  it('reports an anonymous state from /api/auth/me instead of failing', async () => {
    const response = await request('/api/auth/me');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false, user: null });
  });

  it('rejects a forged session cookie', async () => {
    const response = await request('/api/progress', { token: 'not-a-real-token' });
    expect(response.status).toBe(401);
  });
});

describe('authenticated progress access', () => {
  it('starts with an empty progress list', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress', { token });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('stores and reads back a progress record', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const record = progressFor('w_consolidate', {
      status: 'reviewing',
      bookmarked: true,
      quizAttempts: 3,
      correctAnswers: 2,
      mistakeCount: 1,
      reviewStreak: 2,
    });

    const put = await request('/api/progress/w_consolidate', {
      method: 'PUT',
      token,
      body: JSON.stringify(record),
    });
    expect(put.status).toBe(200);

    const get = await request('/api/progress/w_consolidate', { token });
    expect(await get.json()).toMatchObject({
      wordId: 'w_consolidate',
      status: 'reviewing',
      bookmarked: true,
      quizAttempts: 3,
      correctAnswers: 2,
    });
  });

  it('uses the path parameter as authoritative, ignoring a mismatched body wordId', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    await request('/api/progress/w_real', {
      method: 'PUT',
      token,
      body: JSON.stringify(progressFor('w_spoofed', { bookmarked: true })),
    });

    const all = (await (await request('/api/progress', { token })).json()) as WordProgress[];
    expect(all.map((item) => item.wordId)).toEqual(['w_real']);
  });

  it('404s for a word with no recorded progress', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress/w_missing', { token });
    expect(response.status).toBe(404);
  });

  it('rejects a malformed progress payload with 400', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress/w_consolidate', {
      method: 'PUT',
      token,
      body: JSON.stringify({ status: 'not-a-status', bookmarked: 'yes' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_failed');
  });

  it('rejects impossible counters (correctAnswers > quizAttempts)', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress/w_consolidate', {
      method: 'PUT',
      token,
      body: JSON.stringify(progressFor('w_consolidate', { quizAttempts: 1, correctAnswers: 5 })),
    });
    expect(response.status).toBe(400);
  });

  it('rejects a body that is not JSON at all', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress/w_consolidate', {
      method: 'PUT',
      token,
      body: 'not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('cross-user isolation', () => {
  it('never returns another user’s progress list', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    await request('/api/progress/w_alice_word', {
      method: 'PUT',
      token: alice.token,
      body: JSON.stringify(progressFor('w_alice_word', { bookmarked: true })),
    });

    const bobList = (await (await request('/api/progress', { token: bob.token })).json()) as unknown[];
    expect(bobList).toEqual([]);
  });

  it('never returns another user’s single progress record', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    await request('/api/progress/w_secret', {
      method: 'PUT',
      token: alice.token,
      body: JSON.stringify(progressFor('w_secret')),
    });

    const response = await request('/api/progress/w_secret', { token: bob.token });
    expect(response.status).toBe(404);
  });

  it('keeps writes to the same word id separate per user', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    await request('/api/progress/w_shared', {
      method: 'PUT',
      token: alice.token,
      body: JSON.stringify(progressFor('w_shared', { quizAttempts: 10, correctAnswers: 9 })),
    });
    await request('/api/progress/w_shared', {
      method: 'PUT',
      token: bob.token,
      body: JSON.stringify(progressFor('w_shared', { quizAttempts: 1, correctAnswers: 0 })),
    });

    const aliceRecord = (await (
      await request('/api/progress/w_shared', { token: alice.token })
    ).json()) as WordProgress;
    const bobRecord = (await (
      await request('/api/progress/w_shared', { token: bob.token })
    ).json()) as WordProgress;

    expect(aliceRecord.quizAttempts).toBe(10);
    expect(bobRecord.quizAttempts).toBe(1);
  });

  it('does not let one user answer into another user’s quiz attempt', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    const created = (await (
      await request('/api/quiz', {
        method: 'POST',
        token: alice.token,
        body: JSON.stringify({ totalQuestions: 5 }),
      })
    ).json()) as { quizId: string };

    const response = await request(`/api/quiz/${created.quizId}/answer`, {
      method: 'POST',
      token: bob.token,
      body: JSON.stringify({
        questionId: 'q_x',
        selectedOptionId: 'a',
        correct: true,
      }),
    });
    expect(response.status).toBe(404);
  });

  it('does not let one user complete another user’s quiz attempt', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    const created = (await (
      await request('/api/quiz', {
        method: 'POST',
        token: alice.token,
        body: JSON.stringify({ totalQuestions: 5 }),
      })
    ).json()) as { quizId: string };

    const response = await request(`/api/quiz/${created.quizId}/complete`, {
      method: 'POST',
      token: bob.token,
      body: JSON.stringify({ correctAnswers: 5 }),
    });
    expect(response.status).toBe(404);
  });

  it('keeps quiz history separate', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    await request('/api/quiz', {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({ totalQuestions: 5 }),
    });

    const bobHistory = (await (await request('/api/quiz', { token: bob.token })).json()) as unknown[];
    expect(bobHistory).toEqual([]);
  });

  it('keeps settings separate', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    await request('/api/settings', {
      method: 'PUT',
      token: alice.token,
      body: JSON.stringify({ ...DEFAULT_SETTINGS, questionsPerQuiz: 30 }),
    });

    const bobSettings = (await (await request('/api/settings', { token: bob.token })).json()) as {
      questionsPerQuiz: number;
    };
    expect(bobSettings.questionsPerQuiz).toBe(DEFAULT_SETTINGS.questionsPerQuiz);
  });

  it('keeps statistics separate', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    const created = (await (
      await request('/api/quiz', {
        method: 'POST',
        token: alice.token,
        body: JSON.stringify({ totalQuestions: 1 }),
      })
    ).json()) as { quizId: string };

    await request(`/api/quiz/${created.quizId}/answer`, {
      method: 'POST',
      token: alice.token,
      body: JSON.stringify({
        questionId: 'q_1',
        selectedOptionId: 'a',
        correct: true,
        questionType: 'cloze',
        cefr: 'C1',
      }),
    });

    const bobStats = (await (await request('/api/stats', { token: bob.token })).json()) as {
      totalQuestionsAnswered: number;
    };
    expect(bobStats.totalQuestionsAnswered).toBe(0);

    const aliceStats = (await (await request('/api/stats', { token: alice.token })).json()) as {
      totalQuestionsAnswered: number;
    };
    expect(aliceStats.totalQuestionsAnswered).toBe(1);
  });
});

describe('session lifecycle', () => {
  it('resolves the signed-in user from the cookie', async () => {
    const { token, user } = await createUserWithSession(99, 'octocat');
    const response = await request('/api/auth/me', { token });
    const body = (await response.json()) as { authenticated: boolean; user: { id: string } };
    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe(user.id);
  });

  it('rejects an expired session and deletes it', async () => {
    const users = new UserRepository(env.DB);
    const sessions = new SessionRepository(env.DB);
    const user = await users.upsertByGithubIdentity(
      { githubId: 7, githubLogin: 'expired' },
      NOW.toISOString(),
    );
    // A session created 31 days ago has passed the 30-day TTL.
    const past = new Date(Date.now() - 31 * 86_400_000);
    const { token } = await sessions.create(user.id, past);

    const response = await request('/api/progress', { token });
    expect(response.status).toBe(401);

    const remaining = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>();
    expect(remaining?.n).toBe(0);
  });

  it('invalidates the session server-side on logout', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    expect((await request('/api/progress', { token })).status).toBe(200);

    const logout = await request('/api/auth/logout', { method: 'POST', token });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');

    // Replaying the captured token must now fail: clearing the cookie alone
    // would not have been enough.
    expect((await request('/api/progress', { token })).status).toBe(401);
  });

  it('issues a distinct session token per login (no session fixation)', async () => {
    const users = new UserRepository(env.DB);
    const sessions = new SessionRepository(env.DB);
    const user = await users.upsertByGithubIdentity(
      { githubId: 5, githubLogin: 'x' },
      NOW.toISOString(),
    );
    const first = await sessions.create(user.id, new Date());
    const second = await sessions.create(user.id, new Date());
    expect(first.token).not.toBe(second.token);
  });

  it('stores only a hash of the session token, never the token itself', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const row = await env.DB.prepare('SELECT session_token_hash FROM sessions').first<{
      session_token_hash: string;
    }>();
    expect(row?.session_token_hash).not.toBe(token);
    expect(row?.session_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('OAuth state handling', () => {
  it('accepts a state exactly once', async () => {
    const sessions = new SessionRepository(env.DB);
    const state = await sessions.createOAuthState(NOW);

    await expect(sessions.consumeOAuthState(state, NOW)).resolves.toBe(true);
    // Replay must fail: the row is deleted on first use.
    await expect(sessions.consumeOAuthState(state, NOW)).resolves.toBe(false);
  });

  it('rejects an unknown state', async () => {
    const sessions = new SessionRepository(env.DB);
    await expect(sessions.consumeOAuthState('never-issued', NOW)).resolves.toBe(false);
  });

  it('rejects an expired state', async () => {
    const sessions = new SessionRepository(env.DB);
    const state = await sessions.createOAuthState(NOW);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    await expect(sessions.consumeOAuthState(state, later)).resolves.toBe(false);
  });

  it('redirects to the app with an error reason when state is missing', async () => {
    const response = await request('/api/auth/github/callback?code=abc');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?login=failed&reason=missing_parameters');
  });

  it('redirects with invalid_state when the cookie does not back the state', async () => {
    const response = await request('/api/auth/github/callback?code=abc&state=forged');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?login=failed&reason=invalid_state');
  });

  it('redirects with denied when the user cancels at GitHub', async () => {
    const response = await request('/api/auth/github/callback?error=access_denied');
    expect(response.headers.get('Location')).toBe('/?login=failed&reason=denied');
  });

  it('sends the browser to GitHub with a state cookie', async () => {
    const response = await request('/api/auth/github');
    expect(response.status).toBe(302);

    const location = new URL(response.headers.get('Location')!);
    expect(location.origin).toBe('https://github.com');
    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();

    const setCookie = response.headers.get('Set-Cookie')!;
    expect(setCookie).toContain('evl_oauth_state=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain(state!);
  });
});

describe('OAuth redirect URI', () => {
  const authorizeAt = (origin: string) =>
    app.fetch(new Request(`${origin}/api/auth/github`), env);

  const redirectUriOf = async (response: Response) =>
    new URL(response.headers.get('Location')!).searchParams.get('redirect_uri');

  it('derives the redirect URI from the request origin when APP_URL is unset', async () => {
    delete env.APP_URL;
    const response = await authorizeAt('https://vocab.workers.dev');
    expect(await redirectUriOf(response)).toBe(
      'https://vocab.workers.dev/api/auth/github/callback',
    );
  });

  it('follows the origin the app is actually served on', async () => {
    delete env.APP_URL;
    const response = await authorizeAt('http://localhost:5173');
    expect(await redirectUriOf(response)).toBe(
      'http://localhost:5173/api/auth/github/callback',
    );
  });

  it('still honours APP_URL when one is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    env.APP_URL = 'https://vocab.example.com/';
    const response = await authorizeAt('https://vocab.workers.dev');
    expect(await redirectUriOf(response)).toBe(
      'https://vocab.example.com/api/auth/github/callback',
    );
    // A mismatch is what GitHub reports as an unassociated redirect_uri, so it
    // is spelled out in the logs where the cause is still known.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not match the request origin'));
    warn.mockRestore();
  });

  it('reports the redirect URI to register with GitHub', async () => {
    delete env.APP_URL;
    const response = await app.fetch(
      new Request('https://vocab.workers.dev/api/auth/github/config'),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirectUri: 'https://vocab.workers.dev/api/auth/github/callback',
      appUrlSource: 'request',
      clientIdConfigured: true,
    });
  });
});

describe('progress import', () => {
  it('merges local progress into an empty account', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/progress/import-local', {
      method: 'POST',
      token,
      body: JSON.stringify({
        importId: 'local-dataset-1',
        progress: [progressFor('w_a', { bookmarked: true }), progressFor('w_b')],
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: true,
      alreadyImported: false,
      created: 2,
    });

    const all = (await (await request('/api/progress', { token })).json()) as WordProgress[];
    expect(all.map((item) => item.wordId).sort()).toEqual(['w_a', 'w_b']);
  });

  it('is idempotent for the same importId', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const body = JSON.stringify({
      importId: 'local-dataset-1',
      progress: [progressFor('w_a', { quizAttempts: 4, correctAnswers: 3 })],
    });

    await request('/api/progress/import-local', { method: 'POST', token, body });
    const second = await request('/api/progress/import-local', { method: 'POST', token, body });

    expect(await second.json()).toMatchObject({ imported: false, alreadyImported: true });

    const all = (await (await request('/api/progress', { token })).json()) as WordProgress[];
    // Counters must not have been doubled by the replay.
    expect(all[0]?.quizAttempts).toBe(4);
  });

  it('merges rather than overwrites existing cloud data', async () => {
    const { token } = await createUserWithSession(1, 'alice');

    await request('/api/progress/w_a', {
      method: 'PUT',
      token,
      body: JSON.stringify(progressFor('w_a', { difficult: true, quizAttempts: 8, correctAnswers: 5 })),
    });

    await request('/api/progress/import-local', {
      method: 'POST',
      token,
      body: JSON.stringify({
        importId: 'local-dataset-1',
        progress: [progressFor('w_a', { bookmarked: true, quizAttempts: 3, correctAnswers: 1 })],
      }),
    });

    const record = (await (await request('/api/progress/w_a', { token })).json()) as WordProgress;
    expect(record.bookmarked).toBe(true); // from local
    expect(record.difficult).toBe(true); // from cloud
    expect(record.quizAttempts).toBe(8); // max, not sum
  });

  it('rejects a malformed import payload without touching existing data', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    await request('/api/progress/w_a', {
      method: 'PUT',
      token,
      body: JSON.stringify(progressFor('w_a', { quizAttempts: 2, correctAnswers: 1 })),
    });

    const response = await request('/api/progress/import-local', {
      method: 'POST',
      token,
      body: JSON.stringify({ importId: 'short', progress: [{ nope: true }] }),
    });
    expect(response.status).toBe(400);

    const record = (await (await request('/api/progress/w_a', { token })).json()) as WordProgress;
    expect(record.quizAttempts).toBe(2);
  });

  it('scopes the import marker per user', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');
    const body = JSON.stringify({
      importId: 'shared-dataset',
      progress: [progressFor('w_a')],
    });

    await request('/api/progress/import-local', { method: 'POST', token: alice.token, body });
    const bobResponse = await request('/api/progress/import-local', {
      method: 'POST',
      token: bob.token,
      body,
    });

    // Bob has never imported this dataset, so it must still apply for him.
    expect(await bobResponse.json()).toMatchObject({ imported: true, alreadyImported: false });
  });
});

describe('quiz and review endpoints', () => {
  it('records answers and completes an attempt', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const created = (await (
      await request('/api/quiz', {
        method: 'POST',
        token,
        body: JSON.stringify({ totalQuestions: 2 }),
      })
    ).json()) as { quizId: string };

    for (const correct of [true, false]) {
      const response = await request(`/api/quiz/${created.quizId}/answer`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          questionId: `q_${String(correct)}`,
          selectedOptionId: 'a',
          correct,
          questionType: 'cloze',
          cefr: 'B2',
        }),
      });
      expect(response.status).toBe(200);
    }

    const complete = await request(`/api/quiz/${created.quizId}/complete`, {
      method: 'POST',
      token,
      body: JSON.stringify({ correctAnswers: 1 }),
    });
    expect(complete.status).toBe(200);

    const stats = (await (await request('/api/stats', { token })).json()) as {
      quizzesCompleted: number;
      totalQuestionsAnswered: number;
      totalCorrectAnswers: number;
    };
    expect(stats.quizzesCompleted).toBe(1);
    expect(stats.totalQuestionsAnswered).toBe(2);
    expect(stats.totalCorrectAnswers).toBe(1);
  });

  it('rejects a completion score larger than the quiz length', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const created = (await (
      await request('/api/quiz', {
        method: 'POST',
        token,
        body: JSON.stringify({ totalQuestions: 2 }),
      })
    ).json()) as { quizId: string };

    const response = await request(`/api/quiz/${created.quizId}/complete`, {
      method: 'POST',
      token,
      body: JSON.stringify({ correctAnswers: 99 }),
    });
    expect(response.status).toBe(400);
  });

  it('returns only words whose review time has arrived', async () => {
    const { token } = await createUserWithSession(1, 'alice');

    await request('/api/progress/w_due', {
      method: 'PUT',
      token,
      body: JSON.stringify(
        progressFor('w_due', { nextReviewAt: new Date(Date.now() - 86_400_000).toISOString() }),
      ),
    });
    await request('/api/progress/w_later', {
      method: 'PUT',
      token,
      body: JSON.stringify(
        progressFor('w_later', { nextReviewAt: new Date(Date.now() + 86_400_000).toISOString() }),
      ),
    });

    const due = (await (await request('/api/review/due', { token })).json()) as WordProgress[];
    expect(due.map((item) => item.wordId)).toEqual(['w_due']);
  });
});

describe('settings endpoint', () => {
  it('returns defaults before anything has been saved', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/settings', { token });
    expect(await response.json()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a saved settings object', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const custom = { ...DEFAULT_SETTINGS, questionsPerQuiz: 20, wordBankView: 'card' as const };

    await request('/api/settings', { method: 'PUT', token, body: JSON.stringify(custom) });
    const response = await request('/api/settings', { token });
    expect(await response.json()).toEqual(custom);
  });

  it('rejects invalid settings', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const response = await request('/api/settings', {
      method: 'PUT',
      token,
      body: JSON.stringify({ ...DEFAULT_SETTINGS, questionsPerQuiz: 9999 }),
    });
    expect(response.status).toBe(400);
  });
});

describe('data deletion', () => {
  it('removes all of a user’s data and nobody else’s', async () => {
    const alice = await createUserWithSession(1, 'alice');
    const bob = await createUserWithSession(2, 'bob');

    for (const account of [alice, bob]) {
      await request('/api/progress/w_a', {
        method: 'PUT',
        token: account.token,
        body: JSON.stringify(progressFor('w_a')),
      });
    }

    const deleted = await request('/api/progress', { method: 'DELETE', token: alice.token });
    expect(deleted.status).toBe(204);

    expect(await (await request('/api/progress', { token: alice.token })).json()).toEqual([]);
    expect(
      ((await (await request('/api/progress', { token: bob.token })).json()) as unknown[]).length,
    ).toBe(1);
  });
});

describe('general API behaviour', () => {
  it('answers the health check without a session', async () => {
    const response = await request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('returns a structured 404 for an unknown endpoint', async () => {
    const response = await request('/api/does-not-exist');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('sets baseline security headers on API responses', async () => {
    const response = await request('/api/health');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('never leaks the client secret in any response', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    for (const path of ['/api/auth/me', '/api/progress', '/api/settings', '/api/stats']) {
      const text = await (await request(path, { token })).text();
      expect(text).not.toContain('client-secret');
      expect(text).not.toContain(env.SESSION_SECRET);
    }
  });
});

describe('SQL injection resistance', () => {
  it('treats a hostile word id as literal data', async () => {
    const { token } = await createUserWithSession(1, 'alice');
    const hostile = "w_a'; DROP TABLE word_progress; --";

    await request(`/api/progress/${encodeURIComponent(hostile)}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(progressFor(hostile)),
    });

    // The table must still exist, and the value stored verbatim.
    const all = (await (await request('/api/progress', { token })).json()) as WordProgress[];
    expect(all).toHaveLength(1);
    expect(all[0]?.wordId).toBe(hostile);
  });

  it('treats a hostile GitHub login as literal data', async () => {
    const users = new UserRepository(env.DB);
    const hostile = "octo'); DROP TABLE users; --";
    const user = await users.upsertByGithubIdentity(
      { githubId: 1234, githubLogin: hostile },
      NOW.toISOString(),
    );
    const found = await users.findById(user.id);
    expect(found?.github_login).toBe(hostile);
  });
});
