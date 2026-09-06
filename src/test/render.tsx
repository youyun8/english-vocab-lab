import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AppearanceProvider } from '@/features/appearance/appearance-context';
import { AuthProvider } from '@/features/auth/auth-context';
import { ProgressProvider } from '@/features/progress/progress-context';
import { SettingsProvider } from '@/features/settings/settings-context';
import { VocabularyProvider } from '@/features/vocabulary/vocabulary-context';

/** Renders a component inside the full provider stack and a memory router. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AppearanceProvider>
          <AuthProvider>
            <SettingsProvider>
              <VocabularyProvider>
                <ProgressProvider>{children}</ProgressProvider>
              </VocabularyProvider>
            </SettingsProvider>
          </AuthProvider>
        </AppearanceProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

/** Stubs `fetch` so tests control what the API returns. */
export function mockApi(handlers: Record<string, unknown>): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    const key = `${init?.method ?? 'GET'} ${path}`;

    if (key in handlers) {
      return new Response(JSON.stringify(handlers[key]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path in handlers) {
      return new Response(JSON.stringify(handlers[path]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'no' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

export const ANONYMOUS_API = { '/api/auth/me': { authenticated: false, user: null } };
