import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { applyReviewOutcome, markSeen } from '@/domain/review';
import { useAuth } from '@/features/auth/auth-context';
import {
  AnonymousProgressRepository,
  importedAccounts,
  localDatasetId,
  markImportedInto,
  readLocalProgress,
} from '@/repositories/anonymous-progress-repository';
import { CloudProgressRepository } from '@/repositories/cloud-progress-repository';
import type { ProgressRepository } from '@/repositories/progress-repository';
import { apiFetch } from '@/services/api-client';
import { progressImportResultSchema } from '@/shared/api';

/**
 * Single source of truth for word progress in the UI.
 *
 * Pages never touch localStorage or the API directly: they call the methods
 * here, which delegate to whichever `ProgressRepository` matches the current
 * auth state. Writes are optimistic so the interface stays responsive, and are
 * rolled back if persistence fails.
 */

export interface MergePrompt {
  localCount: number;
  accept: () => Promise<void>;
  dismiss: () => void;
}

interface ProgressContextValue {
  progress: WordProgress[];
  byWordId: Map<string, WordProgress>;
  ready: boolean;
  error: string | null;
  get: (wordId: string) => WordProgress;
  toggleBookmark: (wordId: string) => Promise<void>;
  toggleDifficult: (wordId: string) => Promise<void>;
  recordSeen: (wordId: string) => Promise<void>;
  recordOutcome: (wordId: string, correct: boolean) => Promise<WordProgress>;
  resetAll: () => Promise<void>;
  replaceAll: (progress: WordProgress[]) => Promise<void>;
  /** Non-null when a signed-in user still has un-merged local progress. */
  mergePrompt: MergePrompt | null;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

const anonymousRepo = new AnonymousProgressRepository();
const cloudRepo = new CloudProgressRepository();

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const [progress, setProgress] = useState<WordProgress[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);
  // Bumped to force a reload after an import, without an imperative ref.
  const [reloadToken, setReloadToken] = useState(0);

  // Both repositories are module-level singletons, so this is a stable value.
  const repository: ProgressRepository =
    status === 'authenticated' ? cloudRepo : anonymousRepo;

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;

    void (async () => {
      try {
        const items = await repository.getAll();
        if (cancelled) return;
        setProgress(items);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('無法載入學習進度，暫時改用本機資料。');
        setProgress(readLocalProgress());
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, repository, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /**
   * Accounts this browser's dataset has already been merged into. Mirrored in
   * React state so that completing a merge re-derives `pendingLocal` without
   * an out-of-band cache-buster.
   */
  const [importedInto, setImportedInto] = useState<string[]>(() => importedAccounts());

  /**
   * Un-merged local progress for a freshly signed-in account. Derived rather
   * than stored so it cannot go stale relative to the auth state.
   */
  const pendingLocal = useMemo<WordProgress[]>(() => {
    if (status !== 'authenticated' || !user) return [];
    return importedInto.includes(user.id) ? [] : readLocalProgress();
  }, [status, user, importedInto]);

  const byWordId = useMemo(
    () => new Map(progress.map((item) => [item.wordId, item])),
    [progress],
  );

  const get = useCallback(
    (wordId: string): WordProgress =>
      byWordId.get(wordId) ?? createEmptyProgress(wordId, new Date().toISOString()),
    [byWordId],
  );

  /** Optimistic write with rollback on failure. */
  const persist = useCallback(
    async (next: WordProgress) => {
      const previous = progress;
      setProgress((current) => {
        const others = current.filter((item) => item.wordId !== next.wordId);
        return [...others, next];
      });
      try {
        await repository.upsert(next);
        setError(null);
      } catch {
        setProgress(previous);
        setError('儲存進度失敗，請稍後再試。');
      }
    },
    [progress, repository],
  );

  const toggleBookmark = useCallback(
    async (wordId: string) => {
      const current = get(wordId);
      await persist({
        ...current,
        bookmarked: !current.bookmarked,
        updatedAt: new Date().toISOString(),
      });
    },
    [get, persist],
  );

  const toggleDifficult = useCallback(
    async (wordId: string) => {
      const current = get(wordId);
      await persist({
        ...current,
        difficult: !current.difficult,
        updatedAt: new Date().toISOString(),
      });
    },
    [get, persist],
  );

  const recordSeen = useCallback(
    async (wordId: string) => {
      await persist(markSeen(get(wordId), new Date()));
    },
    [get, persist],
  );

  const recordOutcome = useCallback(
    async (wordId: string, correct: boolean) => {
      const next = applyReviewOutcome({ progress: get(wordId), correct, now: new Date() });
      await persist(next);
      return next;
    },
    [get, persist],
  );

  const resetAll = useCallback(async () => {
    await repository.clear();
    setProgress([]);
  }, [repository]);

  const replaceAll = useCallback(
    async (next: WordProgress[]) => {
      await repository.upsertMany(next);
      setProgress(await repository.getAll());
    },
    [repository],
  );

  const acceptMerge = useCallback(async () => {
    if (!user) return;
    const result = await apiFetch<unknown>('/api/progress/import-local', {
      method: 'POST',
      body: JSON.stringify({ importId: localDatasetId(), progress: readLocalProgress() }),
    });
    const parsed = progressImportResultSchema.safeParse(result);
    if (parsed.success) {
      markImportedInto(user.id);
      // Recomputes `pendingLocal` (now empty) and reloads from the cloud.
      setImportedInto(importedAccounts());
      reload();
    }
  }, [user, reload]);

  const mergePrompt = useMemo<MergePrompt | null>(() => {
    if (status !== 'authenticated' || mergeDismissed || pendingLocal.length === 0) return null;
    return {
      localCount: pendingLocal.length,
      accept: acceptMerge,
      dismiss: () => setMergeDismissed(true),
    };
  }, [status, mergeDismissed, pendingLocal, acceptMerge]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress,
      byWordId,
      ready,
      error,
      get,
      toggleBookmark,
      toggleDifficult,
      recordSeen,
      recordOutcome,
      resetAll,
      replaceAll,
      mergePrompt,
    }),
    [
      progress,
      byWordId,
      ready,
      error,
      get,
      toggleBookmark,
      toggleDifficult,
      recordSeen,
      recordOutcome,
      resetAll,
      replaceAll,
      mergePrompt,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const context = useContext(ProgressContext);
  if (!context) throw new Error('useProgress must be used inside <ProgressProvider>');
  return context;
}
