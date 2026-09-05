import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DEFAULT_SETTINGS, type UserSettings } from '@/domain/settings';
import { AnonymousSettingsRepository } from '@/repositories/anonymous-progress-repository';
import { CloudSettingsRepository } from '@/repositories/cloud-progress-repository';
import type { SettingsRepository } from '@/repositories/progress-repository';
import { useAuth } from '@/features/auth/auth-context';

interface SettingsContextValue {
  settings: UserSettings;
  ready: boolean;
  update: (patch: Partial<UserSettings>) => Promise<void>;
  replace: (settings: UserSettings) => Promise<void>;
  reset: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const localRepo = new AnonymousSettingsRepository();
const cloudRepo = new CloudSettingsRepository();

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  const repository: SettingsRepository = status === 'authenticated' ? cloudRepo : localRepo;

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await repository.get();
        if (!cancelled) setSettings(loaded);
      } catch {
        // Falling back to defaults keeps the app usable when the API is down.
        if (!cancelled) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, repository]);

  const persist = useCallback(
    async (next: UserSettings) => {
      setSettings(next);
      // Always keep a local copy so signed-in preferences survive going offline.
      await localRepo.save(next);
      if (status === 'authenticated') {
        await cloudRepo.save(next).catch(() => undefined);
      }
    },
    [status],
  );

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      await persist({ ...settings, ...patch });
    },
    [persist, settings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      update,
      replace: persist,
      reset: () => persist(DEFAULT_SETTINGS),
    }),
    [settings, ready, update, persist],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>');
  return context;
}
