import {
  loadCuratedQuestions,
  loadEntriesByIds,
  loadSearchText,
  loadVocabularyIndex,
} from '@/data';
import type { QuizQuestion } from '@/domain/quiz';
import type { VocabularyEntry, VocabularySummary } from '@/domain/vocabulary';

/**
 * Read-only access to the static corpus.
 *
 * Pages never import JSON directly; they go through this interface so that the
 * corpus could later move to an API or a database without touching the UI. The
 * split between `getIndex` (every word, list-level fields) and `getEntries`
 * (full entries for named ids) is exactly the split such an API would have —
 * and there is deliberately no "give me everything": no page needs it.
 */
export interface VocabularyRepository {
  /** Every word as an index record. One request, cached for the session. */
  getIndex(): Promise<VocabularySummary[]>;
  /** Full entries for the given ids, fetching only the chunks that hold them. */
  getEntries(ids: string[]): Promise<VocabularyEntry[]>;
  getById(id: string): Promise<VocabularyEntry | null>;
  getBySlug(slug: string): Promise<VocabularyEntry | null>;
  /** The deeper search text, keyed by word id. Loaded on first search. */
  getSearchText(): Promise<Map<string, string>>;
  getQuestions(): Promise<QuizQuestion[]>;
}

class StaticVocabularyRepository implements VocabularyRepository {
  private slugIndex: Promise<Map<string, VocabularySummary>> | null = null;

  private bySlug() {
    this.slugIndex ??= loadVocabularyIndex().then(
      (summaries) => new Map(summaries.map((summary) => [summary.slug, summary])),
    );
    return this.slugIndex;
  }

  getIndex(): Promise<VocabularySummary[]> {
    return loadVocabularyIndex();
  }

  getEntries(ids: string[]): Promise<VocabularyEntry[]> {
    return loadEntriesByIds(ids);
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    return (await loadEntriesByIds([id]))[0] ?? null;
  }

  async getBySlug(slug: string): Promise<VocabularyEntry | null> {
    const summary = (await this.bySlug()).get(slug);
    return summary ? this.getById(summary.id) : null;
  }

  getSearchText(): Promise<Map<string, string>> {
    return loadSearchText();
  }

  getQuestions(): Promise<QuizQuestion[]> {
    return loadCuratedQuestions();
  }
}

export const vocabularyRepository: VocabularyRepository = new StaticVocabularyRepository();
