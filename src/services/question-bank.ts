import {
  questionTypes,
  type Difficulty,
  type QuestionType,
  type QuizQuestion,
} from '@/domain/quiz';
import type { CefrLevel, VocabularyEntry } from '@/domain/vocabulary';
import { generateQuestions } from '@/services/question-generator';
import { createRng } from '@/utils/random';

/**
 * The browsable question bank.
 *
 * The curated JSON files only cover the hand-written lessons, which is a small
 * slice of the corpus. The bank shown on the question-bank page is therefore
 * assembled the way a quiz is: curated questions first, then recognition
 * questions generated from *every* vocabulary entry, so the bank always
 * reflects the vocabulary that is actually shipped.
 *
 * Generation uses a fixed seed rather than `Math.random`, so a word's options
 * stay the same between renders, pages and reloads — a bank whose options
 * reshuffle under the reader is impossible to study from.
 */

const BANK_SEED = 20260906;

export type QuestionSource = 'curated' | 'generated';

export const questionSourceLabelZh: Record<QuestionSource, string> = {
  curated: '人工編寫',
  generated: '自動生成',
};

export interface QuestionBankFilters {
  /** Free text matched against the headword, the prompt and the options. */
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

const TYPE_ORDER = new Map(questionTypes.map((type, index) => [type, index]));

/** Groups a word's questions together, curated first, then by question type. */
function sortKey(question: QuizQuestion, byId: Map<string, VocabularyEntry>): string {
  const lemma = byId.get(question.wordIds[0] ?? '')?.lemma ?? '';
  const sourceRank = question.source === 'curated' ? '0' : '1';
  const typeRank = String(TYPE_ORDER.get(question.type) ?? 99).padStart(2, '0');
  return `${lemma.toLowerCase()} ${sourceRank}${typeRank} ${question.id}`;
}

/**
 * Builds the whole bank. Deterministic: the same corpus always yields the same
 * questions, in the same order, with the same options.
 */
export function buildQuestionBank(
  entries: VocabularyEntry[],
  curatedQuestions: QuizQuestion[],
  options: { seed?: number } = {},
): QuizQuestion[] {
  const generated = generateQuestions(entries, {
    rng: createRng(options.seed ?? BANK_SEED),
    pool: entries,
  });

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const bank: QuizQuestion[] = [];
  for (const question of [...curatedQuestions, ...generated]) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    bank.push(question);
  }

  return bank.sort((a, b) => sortKey(a, byId).localeCompare(sortKey(b, byId)));
}

function haystack(question: QuizQuestion, byId: Map<string, VocabularyEntry>): string {
  const lemmas = question.wordIds.map((id) => byId.get(id)?.lemma ?? '');
  return [
    ...lemmas,
    question.prompt,
    question.context ?? '',
    ...question.options.map((option) => option.text),
  ]
    .join(' ')
    .toLowerCase();
}

export function filterQuestionBank(
  questions: QuizQuestion[],
  filters: QuestionBankFilters,
  byId: Map<string, VocabularyEntry>,
): QuizQuestion[] {
  const query = filters.query.trim().toLowerCase();

  return questions.filter((question) => {
    if (filters.types.length > 0 && !filters.types.includes(question.type)) return false;
    if (filters.levels.length > 0 && !filters.levels.includes(question.cefr)) return false;
    if (filters.difficulties.length > 0 && !filters.difficulties.includes(question.difficulty)) {
      return false;
    }
    if (filters.sources.length > 0 && !filters.sources.includes(question.source)) return false;
    if (filters.tag && !question.tags.includes(filters.tag)) return false;
    if (query && !haystack(question, byId).includes(query)) return false;
    return true;
  });
}

export interface QuestionBankSummary {
  total: number;
  curated: number;
  generated: number;
  /** Vocabulary entries the bank exercises at least once. */
  coveredWords: number;
}

export function summarizeQuestionBank(questions: QuizQuestion[]): QuestionBankSummary {
  const words = new Set<string>();
  let curated = 0;
  for (const question of questions) {
    if (question.source === 'curated') curated += 1;
    question.wordIds.forEach((id) => words.add(id));
  }
  return {
    total: questions.length,
    curated,
    generated: questions.length - curated,
    coveredWords: words.size,
  };
}

/** Tags present in the bank, for the tag filter. */
export function collectQuestionTags(questions: QuizQuestion[]): string[] {
  return [...new Set(questions.flatMap((question) => question.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}
