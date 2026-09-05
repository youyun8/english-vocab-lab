import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { User } from '@/domain/user';
import { authStateSchema } from '@/domain/user';
import { apiFetch, ApiRequestError } from '@/services/api-client';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Starts the GitHub OAuth flow by leaving the SPA. */
  signIn: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    try {
      const raw = await apiFetch<unknown>('/api/auth/me');
      const parsed = authStateSchema.safeParse(raw);
      if (parsed.success && parsed.data.authenticated && parsed.data.user) {
        setUser(parsed.data.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch (error) {
      setUser(null);
      // A 401 simply means "not signed in"; anything else means the API is not
      // reachable, which the UI shows as a degraded (local-only) mode.
      setStatus(error instanceof ApiRequestError && error.isUnauthorized ? 'anonymous' : 'unavailable');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const signIn = useCallback(() => {
    window.location.href = '/api/auth/github';
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signIn, signOut, refresh }),
    [status, user, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
