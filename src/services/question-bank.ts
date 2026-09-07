import {
  questionTypes,
  type Difficulty,
  type QuestionType,
  type QuizQuestion,
} from '@/domain/quiz';
import type { CefrLevel, VocabularyEntry, VocabularySummary } from '@/domain/vocabulary';
import { generateQuestions, generatedQuestionMeta } from '@/services/question-generator';
import { createRng, shuffle } from '@/utils/random';

/**
 * The browsable question bank.
 *
 * The curated JSON files only cover the hand-written lessons, which is a small
 * slice of the corpus, so the bank also contains a recognition question for
 * every word the vocabulary index says can produce one.
 *
 * Nothing is generated to browse it. The index says which types each word
 * supports, which is enough to know what the bank *contains* — its size, its
 * order, and what every filter would leave — so the page builds a list of
 * question *references* and only turns the twenty on the current page into
 * real questions, loading just those words. A bank over ten thousand words
 * costs the same to open as one over a hundred.
 */

export type QuestionSource = 'curated' | 'generated';

export const questionSourceLabelZh: Record<QuestionSource, string> = {
  curated: '人工編寫',
  generated: '自動生成',
};

export interface QuestionBankFilters {
  /** Free text matched against the headword, the gloss and curated wording. */
  query: string;
  types: QuestionType[];
  levels: CefrLevel[];
  difficulties: Difficulty[];
  sources: QuestionSource[];
  tag: string;
}

export const DEFAULT_QUESTION_BANK_FILTERS: QuestionBankFilters = {
  query: '',
  types: [],
  levels: [],
  difficulties: [],
  sources: [],
  tag: '',
};

/**
 * One question in the bank, before it exists.
 *
 * Curated references carry their question, which is already loaded. Generated
 * ones carry only what the index knows, and are built on demand.
 */
export interface QuestionRef {
  id: string;
  source: QuestionSource;
  type: QuestionType;
  cefr: CefrLevel;
  difficulty: Difficulty;
  tags: string[];
  wordIds: string[];
  /** Headword of the primary word, which is also the bank's sort key. */
  lemma: string;
  /** Lower-cased text the query filter matches without loading anything. */
  searchable: string;
  /** Present for curated references; generated ones are built per page. */
  question?: QuizQuestion;
}

const TYPE_ORDER = new Map(questionTypes.map((type, index) => [type, index]));

/** Groups a word's questions together, curated first, then by question type. */
function sortKey(ref: QuestionRef): string {
  const sourceRank = ref.source === 'curated' ? '0' : '1';
  const typeRank = String(TYPE_ORDER.get(ref.type) ?? 99).padStart(2, '0');
  return `${ref.lemma.toLowerCase()} ${sourceRank}${typeRank} ${ref.id}`;
}

function curatedSearchable(question: QuizQuestion, lemmas: string[]): string {
  return [
    ...lemmas,
    question.prompt,
    question.context ?? '',
    ...question.options.map((option) => option.text),
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * The whole bank as references, in display order. Cheap: one pass over the
 * index and the curated questions, no vocabulary entries loaded.
 */
export function buildQuestionRefs(
  summaries: VocabularySummary[],
  curatedQuestions: QuizQuestion[],
): QuestionRef[] {
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  const refs: QuestionRef[] = [];

  for (const question of curatedQuestions) {
    const lemmas = question.wordIds.map((id) => byId.get(id)?.lemma ?? '');
    refs.push({
      id: question.id,
      source: 'curated',
      type: question.type,
      cefr: question.cefr,
      difficulty: question.difficulty,
      tags: question.tags,
      wordIds: question.wordIds,
      lemma: lemmas[0] ?? '',
      searchable: curatedSearchable(question, lemmas),
      question,
    });
  }

  for (const summary of summaries) {
    for (const type of summary.generatedTypes) {
      const meta = generatedQuestionMeta(summary, type);
      refs.push({
        id: meta.id,
        source: 'generated',
        type,
        cefr: summary.cefr,
        difficulty: meta.difficulty,
        tags: meta.tags,
        wordIds: [summary.id],
        lemma: summary.lemma,
        // A generated question is written from the headword and the gloss, so
        // matching those matches its prompt. Its options are other words'
        // glosses, which only exist once the page is built.
        searchable: `${summary.lemma} ${summary.meaningZh}`.toLowerCase(),
        question: undefined,
      });
    }
  }

  return refs.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Filter groups a facet count may ignore, one per chip row. */
type QuestionFilterGroup = 'types' | 'levels' | 'difficulties' | 'sources' | 'tag';

function matchesFilters(
  ref: QuestionRef,
  filters: QuestionBankFilters,
  query: string,
  skip?: QuestionFilterGroup,
): boolean {
  if (skip !== 'types' && filters.types.length > 0 && !filters.types.includes(ref.type)) {
    return false;
  }
  if (skip !== 'levels' && filters.levels.length > 0 && !filters.levels.includes(ref.cefr)) {
    return false;
  }
  if (skip !== 'difficulties' && filters.difficulties.length > 0
    && !filters.difficulties.includes(ref.difficulty)) {
    return false;
  }
  if (skip !== 'sources' && filters.sources.length > 0
    && !filters.sources.includes(ref.source)) {
    return false;
  }
  if (skip !== 'tag' && filters.tag && !ref.tags.includes(filters.tag)) return false;
  if (query && !ref.searchable.includes(query)) return false;
  return true;
}

export function filterQuestionRefs(
  refs: QuestionRef[],
  filters: QuestionBankFilters,
): QuestionRef[] {
  const query = filters.query.trim().toLowerCase();
  return refs.filter((ref) => matchesFilters(ref, filters, query));
}

export interface QuestionFacetCounts {
  types: Map<QuestionType, number>;
  levels: Map<CefrLevel, number>;
  difficulties: Map<Difficulty, number>;
  sources: Map<QuestionSource, number>;
  tags: Map<string, number>;
}

/** How many questions each filter value would leave, ignoring its own group. */
export function questionFacetCounts(
  refs: QuestionRef[],
  filters: QuestionBankFilters,
): QuestionFacetCounts {
  const counts: QuestionFacetCounts = {
    types: new Map(),
    levels: new Map(),
    difficulties: new Map(),
    sources: new Map(),
    tags: new Map(),
  };
  const bump = <T>(map: Map<T, number>, key: T) => map.set(key, (map.get(key) ?? 0) + 1);
  const query = filters.query.trim().toLowerCase();

  for (const ref of refs) {
    if (matchesFilters(ref, filters, query, 'types')) bump(counts.types, ref.type);
    if (matchesFilters(ref, filters, query, 'levels')) bump(counts.levels, ref.cefr);
    if (matchesFilters(ref, filters, query, 'difficulties')) {
      bump(counts.difficulties, ref.difficulty);
    }
    if (matchesFilters(ref, filters, query, 'sources')) bump(counts.sources, ref.source);
    if (matchesFilters(ref, filters, query, 'tag')) {
      for (const tag of ref.tags) bump(counts.tags, tag);
    }
  }

  return counts;
}

/** How many filters are applied, for the "N applied" badge and clear button. */
export function countActiveQuestionFilters(filters: QuestionBankFilters): number {
  return filters.types.length
    + filters.levels.length
    + filters.difficulties.length
    + filters.sources.length
    + (filters.tag ? 1 : 0)
    + (filters.query.trim() ? 1 : 0);
}

export interface QuestionBankSummary {
  total: number;
  curated: number;
  generated: number;
  /** Vocabulary entries the bank exercises at least once. */
  coveredWords: number;
}

export function summarizeQuestionBank(refs: QuestionRef[]): QuestionBankSummary {
  const words = new Set<string>();
  let curated = 0;
  for (const ref of refs) {
    if (ref.source === 'curated') curated += 1;
    ref.wordIds.forEach((id) => words.add(id));
  }
  return {
    total: refs.length,
    curated,
    generated: refs.length - curated,
    coveredWords: words.size,
  };
}

/** Tags present in the bank, for the tag filter. */
export function collectQuestionTags(refs: QuestionRef[]): string[] {
  return [...new Set(refs.flatMap((ref) => ref.tags))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Building one page
// ---------------------------------------------------------------------------

/** Extra data files a page opens so its distractors are not all neighbours. */
const POOL_CHUNKS = 5;

/**
 * The words one page of references needs loaded: the words it asks about, plus
 * a distractor pool.
 *
 * The pool is chosen from the page's own words, so the same slice of the bank
 * always draws on the same pool and a question's options do not change as the
 * reader pages back and forth. Distractors come a chunk at a time for the same
 * reason the quiz does it: sampling words individually would open a data file
 * per distractor.
 */
export function pageWordIds(
  refs: QuestionRef[],
  summaries: VocabularySummary[],
): { targetIds: string[]; poolIds: string[] } {
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));
  const targetIds = [...new Set(refs.flatMap((ref) => ref.wordIds))].filter((id) => byId.has(id));

  const targetChunks = new Set(
    targetIds.map((id) => byId.get(id)?.chunk).filter((chunk): chunk is string => chunk != null),
  );
  // Seeded by the page's own chunks: same page, same pool, same options.
  const rng = createRng(hashString([...targetChunks].sort().join('|')));
  const otherChunks = shuffle(
    [...new Set(summaries.map((summary) => summary.chunk))].filter(
      (chunk) => !targetChunks.has(chunk),
    ),
    rng,
  ).slice(0, POOL_CHUNKS);

  const poolChunks = new Set([...targetChunks, ...otherChunks]);
  const poolIds = summaries
    .filter((summary) => poolChunks.has(summary.chunk))
    .map((summary) => summary.id);

  return { targetIds, poolIds };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Turns one page of references into questions. Curated ones are already built;
 * generated ones are produced from the entries the page loaded, each seeded by
 * its own id so the same question always shuffles its options the same way.
 */
export function materializeQuestions(
  refs: QuestionRef[],
  entries: VocabularyEntry[],
  poolEntries: VocabularyEntry[],
): QuizQuestion[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pool = poolEntries.length >= 4 ? poolEntries : entries;
  const built = new Map<string, QuizQuestion>();

  for (const ref of refs) {
    if (ref.question) {
      built.set(ref.id, ref.question);
      continue;
    }
    const entry = byId.get(ref.wordIds[0] ?? '');
    if (!entry) continue;
    const [question] = generateQuestions([entry], {
      rng: createRng(hashString(ref.id)),
      types: [ref.type],
      pool,
    });
    if (question) built.set(question.id, question);
  }

  return refs.map((ref) => built.get(ref.id)).filter((q): q is QuizQuestion => q != null);
}
