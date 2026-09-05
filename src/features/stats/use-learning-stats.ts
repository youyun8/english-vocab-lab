import { useEffect, useMemo, useState } from 'react';

import type { LearningStats } from '@/domain/stats';
import { useAuth } from '@/features/auth/auth-context';
import { useProgress } from '@/features/progress/progress-context';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { apiFetch } from '@/services/api-client';
import { computeStats } from '@/services/stats';
import { serverStatsSchema, type ServerStats } from '@/shared/api';

/**
 * Combines the client-owned vocabulary corpus with server-side quiz history.
 * Signed-out learners get the same shape, reconstructed from local counters.
 */
export function useLearningStats(): { stats: LearningStats; loading: boolean } {
  const { entries } = useVocabulary();
  const { progress, ready } = useProgress();
  const { status } = useAuth();
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setServerStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const raw = await apiFetch<unknown>('/api/stats');
        const parsed = serverStatsSchema.safeParse(raw);
        if (!cancelled) setServerStats(parsed.success ? parsed.data : null);
      } catch {
        if (!cancelled) setServerStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const stats = useMemo(
    () => computeStats({ entries, progress, serverStats, now: new Date() }),
    [entries, progress, serverStats],
  );

  return { stats, loading: loading || !ready };
}
