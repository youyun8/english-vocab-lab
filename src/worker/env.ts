/** Bindings and secrets available to the Worker. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** GitHub OAuth App credentials. Set with `wrangler secret put`. */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** High-entropy secret used to derive the OAuth state cookie signature. */
  SESSION_SECRET: string;
  /** Public origin of the deployment, e.g. https://vocab.example.com */
  APP_URL: string;

  /** Set to "development" locally; anything else is treated as production. */
  ENVIRONMENT?: string;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT !== 'development';
}

/**
 * Fails fast at request time if a required secret is missing, so a
 * misconfigured deployment produces a clear 500 rather than a confusing
 * OAuth error halfway through the flow.
 */
export function requireOAuthConfig(env: Env): {
  clientId: string;
  clientSecret: string;
  appUrl: string;
} {
  const missing: string[] = [];
  if (!env.GITHUB_CLIENT_ID) missing.push('GITHUB_CLIENT_ID');
  if (!env.GITHUB_CLIENT_SECRET) missing.push('GITHUB_CLIENT_SECRET');
  if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (!env.APP_URL) missing.push('APP_URL');

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    appUrl: env.APP_URL.replace(/\/+$/, ''),
  };
}
