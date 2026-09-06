import { Hono } from 'hono';

import type { User } from '@/domain/user';
import { API_ERROR_CODES } from '@/shared/api';
import { requireOAuthConfig, resolveAppUrl, isProduction } from '../env';
import { errorBody } from '../middleware/error-handler';
import { resolveUser } from '../middleware/auth';
import { SessionRepository } from '../repositories/session-repository';
import { UserRepository, type UserRow } from '../repositories/user-repository';
import {
  OAuthError,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGithubProfile,
  safeRedirectPath,
} from '../services/github-oauth';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  oauthStateCookie,
  readCookie,
  sessionCookie,
  verifyOAuthStateCookie,
} from '../services/session';
import type { AppEnv } from '../types';

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    githubId: row.github_id,
    githubLogin: row.github_login,
    ...(row.github_name ? { githubName: row.github_name } : {}),
    ...(row.github_avatar_url ? { githubAvatarUrl: row.github_avatar_url } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function callbackUrl(appUrl: string): string {
  return `${appUrl}/api/auth/github/callback`;
}

/**
 * Warns when a configured `APP_URL` does not match the origin the request
 * actually arrived on. GitHub answers such a mismatch with "The redirect_uri is
 * not associated with this application", on its own page, where the app can no
 * longer explain anything - so the explanation is logged here instead.
 */
function warnOnOriginMismatch(requestUrl: string, appUrl: string): void {
  const requestOrigin = new URL(requestUrl).origin;
  if (requestOrigin === appUrl) return;
  console.warn(
    `APP_URL (${appUrl}) does not match the request origin (${requestOrigin}); ` +
      `GitHub will be sent redirect_uri=${callbackUrl(appUrl)}. ` +
      'Register exactly that URL as the OAuth App callback URL, or unset APP_URL ' +
      'to derive it from the request.',
  );
}

const auth = new Hono<AppEnv>();

/** Step 1: mint a single-use state and hand the browser off to GitHub. */
auth.get('/github', async (c) => {
  const { clientId, appUrl, appUrlSource } = requireOAuthConfig(c.env, c.req.raw);
  if (appUrlSource === 'APP_URL') warnOnOriginMismatch(c.req.url, appUrl);
  const now = new Date();

  const sessions = new SessionRepository(c.env.DB);
  await sessions.deleteExpired(now).catch(() => {
    /* opportunistic cleanup - never block a login on it */
  });

  const state = await sessions.createOAuthState(now);

  c.header('Set-Cookie', await oauthStateCookie(c.env, state), { append: true });
  return c.redirect(
    buildAuthorizeUrl({ clientId, redirectUri: callbackUrl(appUrl), state }),
    302,
  );
});

/** Step 2: validate state, exchange the code, create an app-owned session. */
auth.get('/github/callback', async (c) => {
  // The token exchange must repeat the same redirect_uri the authorize step
  // sent, so it is resolved the same way here.
  const { clientId, clientSecret, appUrl } = requireOAuthConfig(c.env, c.req.raw);
  const now = new Date();

  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const fail = (reason: string) => {
    // Always clear the state cookie, whatever the outcome.
    c.header('Set-Cookie', clearCookie(OAUTH_STATE_COOKIE, isProduction(c.env)), {
      append: true,
    });
    return c.redirect(`/?login=failed&reason=${encodeURIComponent(reason)}`, 302);
  };

  if (oauthError) return fail('denied');
  if (!code || !state) return fail('missing_parameters');

  // 1. The cookie proves the flow started in this browser and was signed by us.
  const cookieValid = await verifyOAuthStateCookie(
    c.env,
    readCookie(c.req.raw, OAUTH_STATE_COOKIE),
    state,
  );
  if (!cookieValid) return fail('invalid_state');

  // 2. The database row proves the state is known, unexpired and unused.
  const sessions = new SessionRepository(c.env.DB);
  const stateAccepted = await sessions.consumeOAuthState(state, now);
  if (!stateAccepted) return fail('invalid_state');

  try {
    const accessToken = await exchangeCodeForToken({
      clientId,
      clientSecret,
      code,
      redirectUri: callbackUrl(appUrl),
    });

    const profile = await fetchGithubProfile(accessToken);
    // The GitHub token has served its only purpose and is now dropped: it is
    // never stored, logged, or sent to the browser.

    const user = await new UserRepository(c.env.DB).upsertByGithubIdentity(
      profile,
      now.toISOString(),
    );

    // A brand-new session row is always issued on login, so a pre-existing
    // cookie value can never be adopted (session fixation).
    const { token, expiresAt } = await sessions.create(user.id, now);

    c.header('Set-Cookie', clearCookie(OAUTH_STATE_COOKIE, isProduction(c.env)), {
      append: true,
    });
    c.header('Set-Cookie', sessionCookie(c.env, token, expiresAt, now), { append: true });

    return c.redirect(safeRedirectPath('/'), 302);
  } catch (error) {
    if (error instanceof OAuthError) return fail(error.reason);
    console.error('OAuth callback failed', error);
    return fail('unexpected_error');
  }
});

/**
 * Reports the redirect URI this deployment will send to GitHub, so the value to
 * register as the OAuth App callback URL can be read off the running app rather
 * than guessed. Everything here is already public: the redirect URI travels in
 * the authorize URL, and the client id is a public identifier.
 */
auth.get('/github/config', (c) => {
  const { appUrl, source } = resolveAppUrl(c.env, c.req.raw);
  return c.json({
    redirectUri: callbackUrl(appUrl),
    appUrlSource: source,
    clientIdConfigured: Boolean(c.env.GITHUB_CLIENT_ID),
  });
});

auth.get('/me', async (c) => {
  const user = await resolveUser(c.env.DB, c.req.raw, new Date());
  return c.json({ authenticated: user != null, user: user ? toUser(user) : null });
});

auth.post('/logout', async (c) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  if (token) {
    // Revoke server-side first: clearing the cookie alone would leave a valid
    // session behind for anyone who captured the token.
    await new SessionRepository(c.env.DB).revoke(token);
  }
  c.header('Set-Cookie', clearCookie(SESSION_COOKIE, isProduction(c.env)), { append: true });
  return c.json({ ok: true });
});

auth.all('/*', (c) =>
  c.json(errorBody(API_ERROR_CODES.notFound, 'Unknown auth endpoint.'), 404),
);

export default auth;
