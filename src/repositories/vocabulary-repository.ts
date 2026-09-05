import { loadCuratedQuestions, loadVocabulary } from '@/data';
import type { QuizQuestion } from '@/domain/quiz';
import type { VocabularyEntry } from '@/domain/vocabulary';
import { searchVocabulary } from '@/services/search';

/**
 * Read-only access to the static corpus.
 *
 * Pages never import JSON directly; they go through this interface so that the
 * corpus could later move to an API or a database without touching the UI.
 */
export interface VocabularyRepository {
  getAll(): Promise<VocabularyEntry[]>;
  getById(id: string): Promise<VocabularyEntry | null>;
  getBySlug(slug: string): Promise<VocabularyEntry | null>;
  search(query: string): Promise<VocabularyEntry[]>;
  getQuestions(): Promise<QuizQuestion[]>;
}

class StaticVocabularyRepository implements VocabularyRepository {
  private indexPromise: Promise<{
    byId: Map<string, VocabularyEntry>;
    bySlug: Map<string, VocabularyEntry>;
  }> | null = null;

  private indexes() {
    this.indexPromise ??= loadVocabulary().then((entries) => ({
      byId: new Map(entries.map((entry) => [entry.id, entry])),
      bySlug: new Map(entries.map((entry) => [entry.slug, entry])),
    }));
    return this.indexPromise;
  }

  getAll(): Promise<VocabularyEntry[]> {
    return loadVocabulary();
  }

  async getById(id: string): Promise<VocabularyEntry | null> {
    return (await this.indexes()).byId.get(id) ?? null;
  }

  async getBySlug(slug: string): Promise<VocabularyEntry | null> {
    return (await this.indexes()).bySlug.get(slug) ?? null;
  }

  async search(query: string): Promise<VocabularyEntry[]> {
    return searchVocabulary(await loadVocabulary(), query).map((hit) => hit.entry);
  }

  getQuestions(): Promise<QuizQuestion[]> {
    return loadCuratedQuestions();
  }
}

export const vocabularyRepository: VocabularyRepository = new StaticVocabularyRepository();
