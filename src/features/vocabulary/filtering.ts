import { accuracy, type LearningStatus, type WordProgress } from '@/domain/progress';
import { weaknessScore } from '@/domain/review';
import type { CefrLevel, PartOfSpeech, VocabularySummary } from '@/domain/vocabulary';
import { searchVocabulary } from '@/services/search';

/**
 * Pure filtering/sorting for the word bank, kept out of the page component.
 * Everything here works on index records: the word bank never needs a full
 * entry, so it never downloads one.
 */

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
  entries: VocabularySummary[];
  progressByWordId: Map<string, WordProgress>;
  filters: WordFilters;
  now: Date;
  /** Deep search text, once it has loaded; search works without it. */
  deepText?: Map<string, string>;
}

function statusOf(entry: VocabularySummary, progress: Map<string, WordProgress>): LearningStatus {
  return progress.get(entry.id)?.status ?? 'new';
}

/** Groups that `matchesFilters` can be told to ignore, one per facet. */
type FilterGroupKey = 'cefrLevels' | 'partsOfSpeech' | 'tags' | 'statuses' | 'flags';

function matchesFilters(
  entry: VocabularySummary,
  filters: WordFilters,
  progressByWordId: Map<string, WordProgress>,
  skip?: FilterGroupKey,
): boolean {
  if (skip !== 'cefrLevels' && filters.cefrLevels.length > 0
    && !filters.cefrLevels.includes(entry.cefr)) {
    return false;
  }

  if (skip !== 'partsOfSpeech' && filters.partsOfSpeech.length > 0) {
    if (!filters.partsOfSpeech.some((wanted) => entry.partsOfSpeech.includes(wanted))) return false;
  }

  if (skip !== 'tags' && filters.tags.length > 0
    && !filters.tags.some((tag) => entry.tags.includes(tag))) {
    return false;
  }

  const progress = progressByWordId.get(entry.id);

  if (skip !== 'statuses' && filters.statuses.length > 0
    && !filters.statuses.includes(statusOf(entry, progressByWordId))) {
    return false;
  }
  if (skip !== 'flags') {
    if (filters.bookmarkedOnly && !progress?.bookmarked) return false;
    if (filters.difficultOnly && !progress?.difficult) return false;
  }

  return true;
}

/**
 * Search first: it produces a relevance order that the alphabetical sort would
 * otherwise destroy, so the search order is preserved when sorting by the
 * default key. Facet counts reuse the same base so a query is scored once.
 */
function searchBase(
  entries: VocabularySummary[],
  query: string,
  deepText: Map<string, string> | undefined,
): VocabularySummary[] {
  return query.trim()
    ? searchVocabulary(entries, query, deepText).map((hit) => hit.summary)
    : entries;
}

export function filterEntries({
  entries,
  progressByWordId,
  filters,
  now,
  deepText,
}: FilterInput): VocabularySummary[] {
  const filtered = searchBase(entries, filters.query, deepText).filter((entry) =>
    matchesFilters(entry, filters, progressByWordId),
  );

  return sortEntries(filtered, filters, progressByWordId, now, filters.query.trim().length > 0);
}

export interface FacetCounts {
  cefrLevels: Map<CefrLevel, number>;
  partsOfSpeech: Map<PartOfSpeech, number>;
  statuses: Map<LearningStatus, number>;
  tags: Map<string, number>;
  bookmarked: number;
  difficult: number;
}

/**
 * How many words each filter value would leave, counted with that value's own
 * group ignored — the standard faceting rule, so ticking a second level inside
 * a group can only widen the result, never contradict the number shown.
 */
export function facetCounts({
  entries,
  progressByWordId,
  filters,
  deepText,
}: Omit<FilterInput, 'now'>): FacetCounts {
  const counts: FacetCounts = {
    cefrLevels: new Map(),
    partsOfSpeech: new Map(),
    statuses: new Map(),
    tags: new Map(),
    bookmarked: 0,
    difficult: 0,
  };
  const bump = <T>(map: Map<T, number>, key: T) => map.set(key, (map.get(key) ?? 0) + 1);
  const base = searchBase(entries, filters.query, deepText);

  for (const entry of base) {
    if (matchesFilters(entry, filters, progressByWordId, 'cefrLevels')) {
      bump(counts.cefrLevels, entry.cefr);
    }
    if (matchesFilters(entry, filters, progressByWordId, 'partsOfSpeech')) {
      for (const pos of entry.partsOfSpeech) bump(counts.partsOfSpeech, pos);
    }
    if (matchesFilters(entry, filters, progressByWordId, 'tags')) {
      for (const tag of entry.tags) bump(counts.tags, tag);
    }
    if (matchesFilters(entry, filters, progressByWordId, 'statuses')) {
      bump(counts.statuses, statusOf(entry, progressByWordId));
    }
    if (matchesFilters(entry, filters, progressByWordId, 'flags')) {
      const progress = progressByWordId.get(entry.id);
      if (progress?.bookmarked) counts.bookmarked += 1;
      if (progress?.difficult) counts.difficult += 1;
    }
  }

  return counts;
}

/** How many filters are applied, for the "N applied" badge and clear button. */
export function countActiveFilters(filters: WordFilters): number {
  return filters.cefrLevels.length
    + filters.partsOfSpeech.length
    + filters.tags.length
    + filters.statuses.length
    + (filters.bookmarkedOnly ? 1 : 0)
    + (filters.difficultOnly ? 1 : 0)
    + (filters.query.trim() ? 1 : 0)
    + (filters.sort === DEFAULT_FILTERS.sort ? 0 : 1);
}

/** Exam labels come from the source dictionary; the rest are editorial topics. */
export const EXAM_TAGS = ['toefl', 'gre', 'ielts', 'dictionary'] as const;

export function partitionTags(tags: string[]): { exam: string[]; topic: string[] } {
  const exam = EXAM_TAGS.filter((tag) => tags.includes(tag));
  return { exam, topic: tags.filter((tag) => !exam.includes(tag as (typeof EXAM_TAGS)[number])) };
}

function sortEntries(
  entries: VocabularySummary[],
  filters: WordFilters,
  progressByWordId: Map<string, WordProgress>,
  now: Date,
  relevanceOrdered: boolean,
): VocabularySummary[] {
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
export function collectTags(entries: VocabularySummary[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
}
