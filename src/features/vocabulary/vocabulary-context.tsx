import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { QuizQuestion } from '@/domain/quiz';
import type { VocabularyEntry } from '@/domain/vocabulary';
import { vocabularyRepository } from '@/repositories/vocabulary-repository';

interface VocabularyContextValue {
  entries: VocabularyEntry[];
  questions: QuizQuestion[];
  bySlug: Map<string, VocabularyEntry>;
  byId: Map<string, VocabularyEntry>;
  ready: boolean;
  error: string | null;
}

const VocabularyContext = createContext<VocabularyContextValue | null>(null);

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedEntries, loadedQuestions] = await Promise.all([
          vocabularyRepository.getAll(),
          vocabularyRepository.getQuestions(),
        ]);
        if (cancelled) return;
        setEntries(loadedEntries);
        setQuestions(loadedQuestions);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '字彙資料載入失敗。');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<VocabularyContextValue>(
    () => ({
      entries,
      questions,
      bySlug: new Map(entries.map((entry) => [entry.slug, entry])),
      byId: new Map(entries.map((entry) => [entry.id, entry])),
      ready,
      error,
    }),
    [entries, questions, ready, error],
  );

  return <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>;
}

export function useVocabulary(): VocabularyContextValue {
  const context = useContext(VocabularyContext);
  if (!context) throw new Error('useVocabulary must be used inside <VocabularyProvider>');
  return context;
}
