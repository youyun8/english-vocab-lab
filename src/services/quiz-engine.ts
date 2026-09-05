import {
  type QuizAnswerRecord,
  type QuizConfig,
  type QuizQuestion,
  type QuizSession,
  isCorrectAnswer,
} from '@/domain/quiz';
import { accuracy, type WordProgress } from '@/domain/progress';
import { rankByWeakness, weaknessScore } from '@/domain/review';
import type { VocabularyEntry } from '@/domain/vocabulary';
import { generateQuestions } from '@/services/question-generator';
import { createRng, sample, shuffle, type Rng } from '@/utils/random';

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

/** Picks a random subset of entries, used by the "learn" flow on the dashboard. */
export function pickStudyBatch(
  entries: VocabularyEntry[],
  count: number,
  rng: Rng = createRng(1),
): VocabularyEntry[] {
  return sample(entries, count, rng);
}
