import { z } from 'zod';

/**
 * GitHub OAuth, implemented entirely inside the Worker.
 *
 * The GitHub access token never leaves this module: it is used once to read the
 * user's public profile and is then discarded. Nothing provider-issued is
 * stored in D1, in a cookie, or sent to the browser.
 */

export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_USER_URL = 'https://api.github.com/user';

/**
 * An empty scope requests the minimum: public profile information only.
 * The app never needs repository or email access.
 */
export const GITHUB_SCOPE = '';

const USER_AGENT = 'advanced-english-vocabulary';

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  if (GITHUB_SCOPE) url.searchParams.set('scope', GITHUB_SCOPE);
  url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

const githubUserSchema = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

export interface GithubProfile {
  githubId: number;
  githubLogin: string;
  githubName?: string;
  githubAvatarUrl?: string;
}

export class OAuthError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'OAuthError';
    this.reason = reason;
  }
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch;

  const response = await doFetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new OAuthError('token_exchange_failed', 'GitHub rejected the authorization code');
  }

  const payload: unknown = await response.json();
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    // GitHub returns 200 with an { error } body for an expired or reused code.
    throw new OAuthError('token_exchange_failed', 'GitHub did not return an access token');
  }

  return parsed.data.access_token;
}

export async function fetchGithubProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  const response = await fetchImpl(GITHUB_USER_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new OAuthError('profile_fetch_failed', 'Could not read the GitHub profile');
  }

  const parsed = githubUserSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new OAuthError('profile_fetch_failed', 'Unexpected GitHub profile payload');
  }

  const user = parsed.data;
  return {
    githubId: user.id,
    githubLogin: user.login,
    ...(user.name ? { githubName: user.name } : {}),
    ...(user.avatar_url ? { githubAvatarUrl: user.avatar_url } : {}),
  };
}

/**
 * Post-login redirect targets are never taken from the query string; only these
 * fixed in-app paths are allowed. This removes open-redirect risk entirely.
 */
const ALLOWED_REDIRECT_PATHS = new Set([
  '/',
  '/words',
  '/quiz',
  '/review',
  '/question-bank',
  '/stats',
  '/settings',
]);

export function safeRedirectPath(candidate: string | null | undefined): string {
  if (!candidate) return '/';
  // Reject anything that could escape the origin before consulting the allowlist.
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  const path = candidate.split(/[?#]/)[0] ?? '/';
  return ALLOWED_REDIRECT_PATHS.has(path) ? path : '/';
}
