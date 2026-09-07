import {
  type QuizAnswerRecord,
  type QuizConfig,
  type QuizQuestion,
  type QuizSession,
  isCorrectAnswer,
} from '@/domain/quiz';
import { accuracy, type WordProgress } from '@/domain/progress';
import { rankByWeakness, weaknessScore } from '@/domain/review';
import type { VocabularyEntry, VocabularySummary } from '@/domain/vocabulary';
import { generateQuestions } from '@/services/question-generator';
import { createRng, defaultRng, sample, shuffle, type Rng } from '@/utils/random';

/**
 * Assembles quiz sessions from the curated bank plus generated recognition
 * questions, honouring the CEFR / type / mode filters chosen by the learner.
 */

export interface BuildQuizInput {
  config: QuizConfig;
  entries: VocabularyEntry[];
  curatedQuestions: QuizQuestion[];
  progress: WordProgress[];
  now: Date;
  seed?: number;
}

function progressByWordId(progress: WordProgress[]): Map<string, WordProgress> {
  return new Map(progress.map((item) => [item.wordId, item]));
}

/** Word ids the current mode restricts the quiz to; `null` means "no filter". */
export function wordIdsForMode(
  config: QuizConfig,
  progress: WordProgress[],
  now: Date,
): Set<string> | null {
  switch (config.mode) {
    case 'random':
      return null;
    case 'weak': {
      const ranked = rankByWeakness(progress, now).filter(
        (item) => weaknessScore(item, now) > 0,
      );
      return ranked.length > 0 ? new Set(ranked.map((item) => item.wordId)) : null;
    }
    case 'mistakes': {
      const ids = progress.filter((item) => item.mistakeCount > 0).map((item) => item.wordId);
      return ids.length > 0 ? new Set(ids) : null;
    }
    case 'due': {
      const ids = progress
        .filter(
          (item) =>
            item.nextReviewAt != null && Date.parse(item.nextReviewAt) <= now.getTime(),
        )
        .map((item) => item.wordId);
      return ids.length > 0 ? new Set(ids) : null;
    }
    case 'bookmarked': {
      const ids = progress.filter((item) => item.bookmarked).map((item) => item.wordId);
      return ids.length > 0 ? new Set(ids) : null;
    }
    case 'difficult': {
      const ids = progress.filter((item) => item.difficult).map((item) => item.wordId);
      return ids.length > 0 ? new Set(ids) : null;
    }
    default:
      return null;
  }
}

function matchesFilters(
  question: QuizQuestion,
  config: QuizConfig,
  allowedWordIds: Set<string> | null,
): boolean {
  if (!config.cefrLevels.includes(question.cefr)) return false;
  if (!config.questionTypes.includes(question.type)) return false;
  if (allowedWordIds && !question.wordIds.some((id) => allowedWordIds.has(id))) return false;
  return true;
}

/**
 * Orders candidates so that weak words come first when the learner has history,
 * then fills the rest randomly. Questions are never repeated inside a session.
 */
function orderCandidates(
  candidates: QuizQuestion[],
  progressMap: Map<string, WordProgress>,
  now: Date,
  rng: Rng,
  prioritiseWeak: boolean,
): QuizQuestion[] {
  const shuffled = shuffle(candidates, rng);
  if (!prioritiseWeak) return shuffled;

  return shuffled
    .map((question) => {
      const score = Math.max(
        0,
        ...question.wordIds.map((id) => {
          const item = progressMap.get(id);
          return item ? weaknessScore(item, now) : 0;
        }),
      );
      return { question, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.question);
}

/**
 * Words a quiz will draw on, chosen from the index before any entry is loaded.
 *
 * A quiz needs a few dozen words to ask about and a few hundred more to draw
 * distractors from — not the whole corpus. Choosing them from index records
 * first is what lets the page load a handful of data files instead of all of
 * them, and it keeps that cost flat as the corpus grows.
 */
export interface QuizWordSelection {
  /** Words the questions will be about. */
  targetIds: string[];
  /** Extra words loaded only as distractor material. */
  poolIds: string[];
  /** True when the chosen mode had too little material and was widened. */
  relaxed: boolean;
}

/** Extra words per question, so generation has room to reject a collision. */
const TARGET_WORD_FACTOR = 3;
const MIN_TARGET_WORDS = 60;
/** Distractors only need a varied pool, not the corpus. */
const POOL_CHUNKS = 4;
/** Ceiling on data files a quiz opens, before the question-count floor. */
const MAX_TARGET_CHUNKS = 8;

function groupByChunk(summaries: VocabularySummary[]): Map<string, VocabularySummary[]> {
  const groups = new Map<string, VocabularySummary[]>();
  for (const summary of summaries) {
    const group = groups.get(summary.chunk) ?? [];
    group.push(summary);
    groups.set(summary.chunk, group);
  }
  return groups;
}

/**
 * Draws words a chunk at a time.
 *
 * Sampling words independently would scatter a quiz across most of the data
 * files and defeat the point of chunking; taking the fullest chunks first keeps
 * a quiz to a handful of downloads while still varying which chunks it uses.
 */
function sampleByChunk(
  candidates: VocabularySummary[],
  wanted: number,
  floor: number,
  rng: Rng,
): VocabularySummary[] {
  const groups = [...groupByChunk(candidates).values()];
  const ordered = shuffle(groups, rng).sort((a, b) => b.length - a.length);

  const picked: VocabularySummary[] = [];
  for (const [used, group] of ordered.entries()) {
    if (picked.length >= wanted) break;
    if (used >= MAX_TARGET_CHUNKS && picked.length >= floor) break;
    picked.push(...shuffle(group, rng).slice(0, wanted - picked.length));
  }
  return picked;
}

export function selectQuizWords({
  summaries,
  config,
  progress,
  now,
  rng = defaultRng,
}: {
  summaries: VocabularySummary[];
  config: QuizConfig;
  progress: WordProgress[];
  now: Date;
  rng?: Rng;
}): QuizWordSelection {
  const byLevel = summaries.filter((summary) => config.cefrLevels.includes(summary.cefr));
  const allowed = wordIdsForMode(config, progress, now);
  const inMode = allowed ? byLevel.filter((summary) => allowed.has(summary.id)) : byLevel;

  const wanted = Math.max(config.questionCount * TARGET_WORD_FACTOR, MIN_TARGET_WORDS);
  // Too little material for the mode: widen to the whole level, as the session
  // builder would, but decide it here so only the wider set gets downloaded.
  const relaxed = allowed != null && inMode.length < config.questionCount;
  const targets = sampleByChunk(relaxed ? byLevel : inMode, wanted, config.questionCount, rng);
  const targetIds = new Set(targets.map((summary) => summary.id));

  const targetChunks = new Set(targets.map((summary) => summary.chunk));
  const poolGroups = shuffle(
    [...groupByChunk(byLevel.filter((summary) => !targetChunks.has(summary.chunk))).values()],
    rng,
  ).slice(0, POOL_CHUNKS);
  const poolIds = poolGroups
    .flat()
    .filter((summary) => !targetIds.has(summary.id))
    .map((summary) => summary.id);

  return { targetIds: [...targetIds], poolIds, relaxed };
}

export interface BuildQuizResult {
  session: QuizSession;
  /** True when the requested mode had too little material and was relaxed. */
  relaxed: boolean;
}

export function buildQuizSession({
  config,
  entries,
  curatedQuestions,
  progress,
  now,
  seed,
}: BuildQuizInput): BuildQuizResult {
  const rng = createRng(seed ?? Math.floor(Math.random() * 2 ** 31));
  const progressMap = progressByWordId(progress);
  const allowedWordIds = wordIdsForMode(config, progress, now);

  const entriesByLevel = entries.filter((entry) => config.cefrLevels.includes(entry.cefr));
  const generationTargets = allowedWordIds
    ? entriesByLevel.filter((entry) => allowedWordIds.has(entry.id))
    : entriesByLevel;

  const generated = generateQuestions(generationTargets, {
    rng,
    types: config.questionTypes,
    pool: entriesByLevel.length >= 4 ? entriesByLevel : entries,
  });

  const pool = [...curatedQuestions, ...generated].filter((question) =>
    matchesFilters(question, config, allowedWordIds),
  );

  let relaxed = false;
  let candidates = pool;

  if (candidates.length < config.questionCount && allowedWordIds) {
    // Not enough material for the chosen mode: widen to the whole corpus rather
    // than returning a short quiz with no explanation.
    relaxed = true;
    const widerGenerated = generateQuestions(entriesByLevel, {
      rng,
      types: config.questionTypes,
      pool: entriesByLevel,
    });
    candidates = [...curatedQuestions, ...widerGenerated].filter((question) =>
      matchesFilters(question, config, null),
    );
  }

  const deduped = dedupeById(candidates);
  const ordered = orderCandidates(
    deduped,
    progressMap,
    now,
    rng,
    config.mode === 'weak' || config.mode === 'mistakes',
  );

  const selected = ordered.slice(0, config.questionCount);
  const questions = config.shuffleOptions
    ? selected.map((question) => ({ ...question, options: shuffle(question.options, rng) }))
    : selected;

  return {
    session: {
      id: createSessionId(rng),
      config,
      questions,
      answers: [],
      startedAt: now.toISOString(),
    },
    relaxed,
  };
}

function dedupeById(questions: QuizQuestion[]): QuizQuestion[] {
  const seen = new Set<string>();
  const result: QuizQuestion[] = [];
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    result.push(question);
  }
  return result;
}

function createSessionId(rng: Rng): string {
  const part = () => Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0');
  return `qz_${part()}${part()}`;
}

/** Records an answer against a session. Pure: returns a new session. */
export function answerQuestion(
  session: QuizSession,
  questionId: string,
  selectedOptionId: string,
  now: Date,
): { session: QuizSession; record: QuizAnswerRecord } {
  const question = session.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new Error(`Question ${questionId} is not part of session ${session.id}`);
  }

  const record: QuizAnswerRecord = {
    questionId,
    selectedOptionId,
    correct: isCorrectAnswer(question, selectedOptionId),
    answeredAt: now.toISOString(),
    wordIds: question.wordIds,
    type: question.type,
    cefr: question.cefr,
  };

  return {
    session: {
      ...session,
      answers: [...session.answers.filter((a) => a.questionId !== questionId), record],
    },
    record,
  };
}

export interface QuizBreakdownRow {
  key: string;
  attempts: number;
  correct: number;
}

export interface QuizResultSummary {
  total: number;
  correct: number;
  incorrect: number;
  percentage: number;
  byCefr: QuizBreakdownRow[];
  byType: QuizBreakdownRow[];
  missedWordIds: string[];
  strongestCategories: QuizBreakdownRow[];
  weakestCategories: QuizBreakdownRow[];
}

export function summarizeSession(session: QuizSession): QuizResultSummary {
  const total = session.answers.length;
  const correct = session.answers.filter((answer) => answer.correct).length;

  const byCefr = tally(session.answers, (answer) => answer.cefr);
  const byType = tally(session.answers, (answer) => answer.type);

  const missed = new Set<string>();
  for (const answer of session.answers) {
    if (!answer.correct) answer.wordIds.forEach((id) => missed.add(id));
  }

  const ranked = [...byType].sort(
    (a, b) => rowAccuracy(b) - rowAccuracy(a) || a.key.localeCompare(b.key),
  );

  return {
    total,
    correct,
    incorrect: total - correct,
    percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
    byCefr,
    byType,
    missedWordIds: [...missed],
    strongestCategories: ranked.slice(0, 3),
    weakestCategories: [...ranked].reverse().slice(0, 3),
  };
}

function rowAccuracy(row: QuizBreakdownRow): number {
  return accuracy({ quizAttempts: row.attempts, correctAnswers: row.correct });
}

function tally(
  answers: QuizAnswerRecord[],
  key: (answer: QuizAnswerRecord) => string,
): QuizBreakdownRow[] {
  const map = new Map<string, QuizBreakdownRow>();
  for (const answer of answers) {
    const k = key(answer);
    const row = map.get(k) ?? { key: k, attempts: 0, correct: 0 };
    row.attempts += 1;
    if (answer.correct) row.correct += 1;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Picks a random subset, used by the "learn" flow on the dashboard. Index
 * records are enough there: the dashboard only links to the words it suggests.
 */
export function pickStudyBatch<T>(items: T[], count: number, rng: Rng = createRng(1)): T[] {
  return sample(items, count, rng);
}
