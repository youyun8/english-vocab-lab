import type { ReactNode } from 'react';

import { AuthProvider } from '@/features/auth/auth-context';
import { ProgressProvider } from '@/features/progress/progress-context';
import { SettingsProvider } from '@/features/settings/settings-context';
import { VocabularyProvider } from '@/features/vocabulary/vocabulary-context';

/**
 * Provider order matters: settings and progress both read auth state, so
 * `AuthProvider` must sit above them.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <VocabularyProvider>
          <ProgressProvider>{children}</ProgressProvider>
        </VocabularyProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
