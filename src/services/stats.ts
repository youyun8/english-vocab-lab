import { accuracy, isDue, type WordProgress } from '@/domain/progress';
import { rankByWeakness, weaknessScore } from '@/domain/review';
import {
  bumpStatus,
  emptyStatusCounts,
  type ActivityPoint,
  type LearningStats,
} from '@/domain/stats';
import type { CefrLevel, VocabularyEntry } from '@/domain/vocabulary';
import type { ServerStats } from '@/shared/api';

/**
 * Statistics are derived, never stored. The client owns the vocabulary corpus,
 * so word-level totals are computed here; quiz history comes from the server
 * (or from the local session log when signed out).
 */

const emptyBucket = () => ({ attempts: 0, correct: 0 });

export interface ComputeStatsInput {
  entries: VocabularyEntry[];
  progress: WordProgress[];
  serverStats?: ServerStats | null;
  now: Date;
}

export function computeStats({
  entries,
  progress,
  serverStats,
  now,
}: ComputeStatsInput): LearningStats {
  const progressMap = new Map(progress.map((item) => [item.wordId, item]));
  const statusCounts = emptyStatusCounts();

  let bookmarked = 0;
  let difficult = 0;
  let dueForReview = 0;
  let studiedWords = 0;

  for (const entry of entries) {
    const item = progressMap.get(entry.id);
    if (!item) {
      statusCounts.new += 1;
      continue;
    }
    bumpStatus(statusCounts, item.status);
    if (item.bookmarked) bookmarked += 1;
    if (item.difficult) difficult += 1;
    if (isDue(item, now)) dueForReview += 1;
    if (item.status !== 'new' || item.timesSeen > 0) studiedWords += 1;
  }

  const accuracyByCefr = {
    B2: emptyBucket(),
    C1: emptyBucket(),
    C2: emptyBucket(),
  } satisfies Record<CefrLevel, { attempts: number; correct: number }>;

  if (serverStats) {
    for (const [level, bucket] of Object.entries(serverStats.accuracyByCefr)) {
      if (level === 'B2' || level === 'C1' || level === 'C2') {
        accuracyByCefr[level] = { attempts: bucket.attempts, correct: bucket.correct };
      }
    }
  } else {
    // Signed out: reconstruct per-level accuracy from word progress counters.
    const entryLevel = new Map(entries.map((entry) => [entry.id, entry.cefr]));
    for (const item of progress) {
      const level = entryLevel.get(item.wordId);
      if (!level) continue;
      accuracyByCefr[level].attempts += item.quizAttempts;
      accuracyByCefr[level].correct += item.correctAnswers;
    }
  }

  const totalQuestionsAnswered =
    serverStats?.totalQuestionsAnswered ??
    progress.reduce((sum, item) => sum + item.quizAttempts, 0);
  const totalCorrectAnswers =
    serverStats?.totalCorrectAnswers ??
    progress.reduce((sum, item) => sum + item.correctAnswers, 0);

  return {
    totalWords: entries.length,
    statusCounts,
    bookmarked,
    difficult,
    dueForReview,
    studiedWords,
    quizzesCompleted: serverStats?.quizzesCompleted ?? 0,
    totalQuestionsAnswered,
    totalCorrectAnswers,
    overallAccuracy: accuracy({
      quizAttempts: totalQuestionsAnswered,
      correctAnswers: totalCorrectAnswers,
    }),
    currentStreakDays: computeStreakDays(progress, now),
    accuracyByCefr,
    accuracyByQuestionType: normalizeTypeBuckets(serverStats),
    recentActivity: serverStats?.recentActivity ?? localActivity(progress, now),
  };
}

function normalizeTypeBuckets(serverStats?: ServerStats | null): LearningStats['accuracyByQuestionType'] {
  const result: LearningStats['accuracyByQuestionType'] = {};
  if (!serverStats) return result;
  for (const [type, bucket] of Object.entries(serverStats.accuracyByQuestionType)) {
    result[type as keyof LearningStats['accuracyByQuestionType']] = {
      attempts: bucket.attempts,
      correct: bucket.correct,
    };
  }
  return result;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Consecutive days (ending today or yesterday) on which at least one word was
 * reviewed. Yesterday is allowed as the anchor so a streak is not lost simply
 * because the learner has not studied yet today.
 */
export function computeStreakDays(progress: WordProgress[], now: Date): number {
  const days = new Set<string>();
  for (const item of progress) {
    if (item.lastReviewedAt) {
      const parsed = Date.parse(item.lastReviewedAt);
      if (Number.isFinite(parsed)) days.add(dayKey(new Date(parsed)));
    }
  }
  if (days.size === 0) return 0;

  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));

  let cursor: Date;
  if (days.has(today)) {
    cursor = new Date(now);
  } else if (days.has(yesterday)) {
    cursor = new Date(now.getTime() - 86_400_000);
  } else {
    return 0;
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

/** Fallback activity series for signed-out learners (last 14 days). */
function localActivity(progress: WordProgress[], now: Date): ActivityPoint[] {
  const buckets = new Map<string, ActivityPoint>();
  for (let i = 13; i >= 0; i -= 1) {
    const date = dayKey(new Date(now.getTime() - i * 86_400_000));
    buckets.set(date, { date, answered: 0, correct: 0 });
  }

  for (const item of progress) {
    if (!item.lastReviewedAt) continue;
    const parsed = Date.parse(item.lastReviewedAt);
    if (!Number.isFinite(parsed)) continue;
    const bucket = buckets.get(dayKey(new Date(parsed)));
    if (!bucket) continue;
    // Local mode cannot attribute individual answers to days, so the most recent
    // review of each word counts as one data point for that day.
    bucket.answered += 1;
    if (item.reviewStreak > 0) bucket.correct += 1;
  }

  return [...buckets.values()];
}

export interface WeakWordRow {
  entry: VocabularyEntry;
  progress: WordProgress;
  score: number;
}

/** Weakest words first, limited to those the learner has actually attempted. */
export function weakWords(
  entries: VocabularyEntry[],
  progress: WordProgress[],
  now: Date,
  limit = 10,
): WeakWordRow[] {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  return rankByWeakness(progress, now)
    .filter((item) => weaknessScore(item, now) > 0)
    .map((item) => {
      const entry = entryMap.get(item.wordId);
      return entry ? { entry, progress: item, score: weaknessScore(item, now) } : null;
    })
    .filter((row): row is WeakWordRow => row !== null)
    .slice(0, limit);
}

/** Strongest words: high accuracy and a healthy streak. */
export function strongWords(
  entries: VocabularyEntry[],
  progress: WordProgress[],
  limit = 10,
): WeakWordRow[] {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  return progress
    .filter((item) => item.quizAttempts >= 2)
    .map((item) => {
      const entry = entryMap.get(item.wordId);
      return entry
        ? { entry, progress: item, score: accuracy(item) * 100 + item.reviewStreak }
        : null;
    })
    .filter((row): row is WeakWordRow => row !== null)
    .sort((a, b) => b.score - a.score || a.entry.lemma.localeCompare(b.entry.lemma))
    .slice(0, limit);
}
