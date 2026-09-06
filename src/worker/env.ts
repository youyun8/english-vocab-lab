/** Bindings and secrets available to the Worker. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** GitHub OAuth App credentials. Set with `wrangler secret put`. */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** High-entropy secret used to derive the OAuth state cookie signature. */
  SESSION_SECRET: string;
  /**
   * Optional public origin override, e.g. https://vocab.example.com.
   *
   * Leave it unset unless the app is reached through a different origin than
   * the one the Worker sees (a reverse proxy, or a canonical custom domain that
   * should own the login flow). When unset the OAuth redirect URI is derived
   * from the incoming request, which is correct for localhost, *.workers.dev
   * and custom domains alike.
   */
  APP_URL?: string;

  /** Set to "development" locally; anything else is treated as production. */
  ENVIRONMENT?: string;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT !== 'development';
}

/** Where the origin used to build the OAuth redirect URI came from. */
export type AppUrlSource = 'APP_URL' | 'request';

/**
 * Normalizes a configured origin: absolute http(s) only, with any path, query
 * and trailing slash dropped. A value such as `example.com` or
 * `https://example.com/app/` would otherwise produce a redirect URI GitHub
 * rejects with "The redirect_uri is not associated with this application".
 */
export function normalizeAppUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `APP_URL must be an absolute URL such as https://vocab.example.com (received "${trimmed}")`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`APP_URL must use http or https (received "${trimmed}")`);
  }
  return parsed.origin;
}

/**
 * Resolves the public origin of this deployment. `APP_URL` wins when set;
 * otherwise the origin of the request being served is used, so a deployment
 * needs no extra configuration to log in at whatever hostname it is served on.
 */
export function resolveAppUrl(
  env: Env,
  request: Request,
): { appUrl: string; source: AppUrlSource } {
  if (env.APP_URL && env.APP_URL.trim()) {
    return { appUrl: normalizeAppUrl(env.APP_URL), source: 'APP_URL' };
  }
  return { appUrl: new URL(request.url).origin, source: 'request' };
}

/**
 * Fails fast at request time if a required secret is missing, so a
 * misconfigured deployment produces a clear 500 rather than a confusing
 * OAuth error halfway through the flow.
 */
export function requireOAuthConfig(
  env: Env,
  request: Request,
): {
  clientId: string;
  clientSecret: string;
  appUrl: string;
  appUrlSource: AppUrlSource;
} {
  const missing: string[] = [];
  if (!env.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID');
  if (!env.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET');
  if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  const { appUrl, source } = resolveAppUrl(env, request);

  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    appUrl,
    appUrlSource: source,
  };
}
