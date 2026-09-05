import type { Env } from './env';
import type { UserRow } from './repositories/user-repository';

/** Hono generics for this app: bindings plus request-scoped variables. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    /** Set by `requireAuth`; always derived from the session cookie. */
    user: UserRow;
  };
}
