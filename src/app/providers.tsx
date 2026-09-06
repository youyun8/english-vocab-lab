import type { ReactNode } from 'react';

import { AppearanceProvider } from '@/features/appearance/appearance-context';
import { AuthProvider } from '@/features/auth/auth-context';
import { ProgressProvider } from '@/features/progress/progress-context';
import { SettingsProvider } from '@/features/settings/settings-context';
import { VocabularyProvider } from '@/features/vocabulary/vocabulary-context';

/**
 * Provider order matters: settings and progress both read auth state, so
 * `AuthProvider` must sit above them. Appearance is independent of all of
 * them - it is a per-browser preference - so it sits outermost.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider>
      <AuthProvider>
        <SettingsProvider>
          <VocabularyProvider>
            <ProgressProvider>{children}</ProgressProvider>
          </VocabularyProvider>
        </SettingsProvider>
      </AuthProvider>
    </AppearanceProvider>
  );
}
