import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { QuizQuestion } from '@/domain/quiz';
import type { VocabularyEntry, VocabularySummary } from '@/domain/vocabulary';
import { vocabularyRepository } from '@/repositories/vocabulary-repository';

/**
 * Corpus access for the whole app.
 *
 * What every page gets eagerly is the *index*: one row per word with the
 * fields lists, filters, search and links need. Full entries — senses,
 * examples, collocations — are fetched per word, from the one data file that
 * holds them. No page loads the whole corpus, so the first paint is
 * independent of how many thousand words ship.
 */

interface VocabularyContextValue {
  /** Every word, list-level fields only. */
  summaries: VocabularySummary[];
  byId: Map<string, VocabularySummary>;
  bySlug: Map<string, VocabularySummary>;
  ready: boolean;
  error: string | null;
  /** Deep search text once loaded; `null` until a search asks for it. */
  searchText: Map<string, string> | null;
  /** Starts the deep-search download. Safe to call on every keystroke. */
  requestSearchText: () => void;
  /** Full entries for named ids, fetching only the chunks that hold them. */
  loadEntries: (ids: string[]) => Promise<VocabularyEntry[]>;
  /** The curated question bank. Small, but still only loaded when needed. */
  loadQuestions: () => Promise<QuizQuestion[]>;
}

const VocabularyContext = createContext<VocabularyContextValue | null>(null);

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<VocabularySummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<Map<string, string> | null>(null);
  const [searchRequested, setSearchRequested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const index = await vocabularyRepository.getIndex();
        if (!cancelled) setSummaries(index);
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

  // The deep search file is the larger half of the corpus index, so it waits
  // until a learner actually searches. Results sharpen when it lands.
  useEffect(() => {
    if (!searchRequested || searchText) return;
    let cancelled = false;
    void (async () => {
      try {
        const text = await vocabularyRepository.getSearchText();
        if (!cancelled) setSearchText(text);
      } catch {
        // Search still works on headwords, glosses and tags without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchRequested, searchText]);

  const requestSearchText = useCallback(() => setSearchRequested(true), []);
  const loadEntries = useCallback((ids: string[]) => vocabularyRepository.getEntries(ids), []);
  const loadQuestions = useCallback(() => vocabularyRepository.getQuestions(), []);

  const value = useMemo<VocabularyContextValue>(
    () => ({
      summaries,
      byId: new Map(summaries.map((summary) => [summary.id, summary])),
      bySlug: new Map(summaries.map((summary) => [summary.slug, summary])),
      ready,
      error,
      searchText,
      requestSearchText,
      loadEntries,
      loadQuestions,
    }),
    [summaries, ready, error, searchText, requestSearchText, loadEntries, loadQuestions],
  );

  return <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>;
}

export function useVocabulary(): VocabularyContextValue {
  const context = useContext(VocabularyContext);
  if (!context) throw new Error('useVocabulary must be used inside <VocabularyProvider>');
  return context;
}

/**
 * Loads one word's full entry. Used by the word detail page, which is the only
 * place that needs everything a lesson holds.
 */
export function useVocabularyEntry(slug: string | undefined): {
  entry: VocabularyEntry | null;
  loading: boolean;
  missing: boolean;
} {
  const { bySlug, ready, loadEntries } = useVocabulary();
  const summary = slug ? bySlug.get(slug) : undefined;
  // Keyed by id so a stale result from the previous word is never shown.
  const [loaded, setLoaded] = useState<{ id: string; entry: VocabularyEntry | null } | null>(null);

  useEffect(() => {
    if (!summary) return;
    let cancelled = false;
    void (async () => {
      try {
        const [entry] = await loadEntries([summary.id]);
        if (!cancelled) setLoaded({ id: summary.id, entry: entry ?? null });
      } catch {
        if (!cancelled) setLoaded({ id: summary.id, entry: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary, loadEntries]);

  const resolved = summary != null && loaded?.id === summary.id;
  return {
    entry: resolved ? (loaded?.entry ?? null) : null,
    loading: !ready || (summary != null && !resolved),
    missing: ready && (summary == null || (resolved && loaded?.entry == null)),
  };
}
