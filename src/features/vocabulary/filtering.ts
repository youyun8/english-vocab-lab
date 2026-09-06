import { accuracy, type LearningStatus, type WordProgress } from '@/domain/progress';
import { weaknessScore } from '@/domain/review';
import {
  primaryPartsOfSpeech,
  type CefrLevel,
  type PartOfSpeech,
  type VocabularyEntry,
} from '@/domain/vocabulary';
import { searchVocabulary } from '@/services/search';

/** Pure filtering/sorting for the word bank, kept out of the page component. */

export type SortKey =
  | 'alphabetical'
  | 'cefr'
  | 'recent'
  | 'weakest'
  | 'strongest';

export const sortLabelZh: Record<SortKey, string> = {
  alphabetical: '字母順序',
  cefr: 'CEFR 等級',
  recent: '最近學習',
  weakest: '最弱優先',
  strongest: '最強優先',
};

export interface WordFilters {
  query: string;
  cefrLevels: CefrLevel[];
  partsOfSpeech: PartOfSpeech[];
  tags: string[];
  statuses: LearningStatus[];
  bookmarkedOnly: boolean;
  difficultOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: WordFilters = {
  query: '',
  cefrLevels: [],
  partsOfSpeech: [],
  tags: [],
  statuses: [],
  bookmarkedOnly: false,
  difficultOnly: false,
  sort: 'alphabetical',
};

const CEFR_ORDER: Record<CefrLevel, number> = { B2: 0, C1: 1, C2: 2 };

export interface FilterInput {
  entries: VocabularyEntry[];
  progressByWordId: Map<string, WordProgress>;
  filters: WordFilters;
  now: Date;
}

function statusOf(entry: VocabularyEntry, progress: Map<string, WordProgress>): LearningStatus {
  return progress.get(entry.id)?.status ?? 'new';
}

export function filterEntries({
  entries,
  progressByWordId,
  filters,
  now,
}: FilterInput): VocabularyEntry[] {
  // Search first: it produces a relevance order that the alphabetical sort
  // would otherwise destroy, so the search order is preserved when sorting by
  // the default key.
  const base = filters.query.trim()
    ? searchVocabulary(entries, filters.query).map((hit) => hit.entry)
    : entries;

  const filtered = base.filter((entry) => {
    if (filters.cefrLevels.length > 0 && !filters.cefrLevels.includes(entry.cefr)) return false;

    if (filters.partsOfSpeech.length > 0) {
      const pos = primaryPartsOfSpeech(entry);
      if (!filters.partsOfSpeech.some((wanted) => pos.includes(wanted))) return false;
    }

    if (filters.tags.length > 0 && !filters.tags.some((tag) => entry.tags.includes(tag))) {
      return false;
    }

    const progress = progressByWordId.get(entry.id);

    if (filters.statuses.length > 0 && !filters.statuses.includes(statusOf(entry, progressByWordId))) {
      return false;
    }
    if (filters.bookmarkedOnly && !progress?.bookmarked) return false;
    if (filters.difficultOnly && !progress?.difficult) return false;

    return true;
  });

  return sortEntries(filtered, filters, progressByWordId, now, filters.query.trim().length > 0);
}

function sortEntries(
  entries: VocabularyEntry[],
  filters: WordFilters,
  progressByWordId: Map<string, WordProgress>,
  now: Date,
  relevanceOrdered: boolean,
): VocabularyEntry[] {
  if (relevanceOrdered && filters.sort === 'alphabetical') return entries;

  const sorted = [...entries];

  switch (filters.sort) {
    case 'alphabetical':
      sorted.sort((a, b) => a.lemma.localeCompare(b.lemma));
      break;

    case 'cefr':
      sorted.sort(
        (a, b) => CEFR_ORDER[a.cefr] - CEFR_ORDER[b.cefr] || a.lemma.localeCompare(b.lemma),
      );
      break;

    case 'recent':
      sorted.sort((a, b) => {
        const at = timestamp(progressByWordId.get(a.id));
        const bt = timestamp(progressByWordId.get(b.id));
        return bt - at || a.lemma.localeCompare(b.lemma);
      });
      break;

    case 'weakest':
      sorted.sort((a, b) => {
        const as = scoreFor(progressByWordId.get(a.id), now);
        const bs = scoreFor(progressByWordId.get(b.id), now);
        return bs - as || a.lemma.localeCompare(b.lemma);
      });
      break;

    case 'strongest':
      sorted.sort((a, b) => {
        const as = strengthFor(progressByWordId.get(a.id));
        const bs = strengthFor(progressByWordId.get(b.id));
        return bs - as || a.lemma.localeCompare(b.lemma);
      });
      break;
  }

  return sorted;
}

function timestamp(progress: WordProgress | undefined): number {
  if (!progress?.lastReviewedAt) return 0;
  const parsed = Date.parse(progress.lastReviewedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreFor(progress: WordProgress | undefined, now: Date): number {
  return progress ? weaknessScore(progress, now) : 0;
}

function strengthFor(progress: WordProgress | undefined): number {
  if (!progress || progress.quizAttempts === 0) return -1;
  return accuracy(progress) * 100 + progress.reviewStreak;
}

/** Every tag present in the corpus, alphabetically. */
export function collectTags(entries: VocabularyEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
}
