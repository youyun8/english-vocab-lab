import { accuracy, type LearningStatus, type WordProgress } from './progress';

/**
 * Lightweight spaced repetition and weak-word ranking.
 *
 * The scheduler is deliberately simple and fully deterministic: given a
 * progress record and a timestamp, the next review date is a pure function of
 * the review streak. This keeps it testable and easy to reason about, and it
 * behaves sensibly for a learner who studies most days.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Interval in days by review streak (consecutive correct answers).
 * streak 0 -> tomorrow, 1 -> 3d, 2 -> 7d, 3 -> 14d, 4+ -> 30d.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

export function intervalDaysForStreak(streak: number): number {
  const index = Math.min(Math.max(streak, 0), REVIEW_INTERVALS_DAYS.length - 1);
  return REVIEW_INTERVALS_DAYS[index] as number;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * A word is considered mastered once it has been answered correctly at least
 * `MASTERY_STREAK` times in a row and its overall accuracy is healthy.
 */
export const MASTERY_STREAK = 4;
export const MASTERY_MIN_ACCURACY = 0.8;

function nextStatus(progress: WordProgress, wasCorrect: boolean): LearningStatus {
  if (!wasCorrect) {
    // A mistake always pulls a word back into active learning.
    return 'learning';
  }
  if (
    progress.reviewStreak >= MASTERY_STREAK &&
    accuracy(progress) >= MASTERY_MIN_ACCURACY
  ) {
    return 'mastered';
  }
  return progress.reviewStreak >= 1 ? 'reviewing' : 'learning';
}

export interface ReviewOutcomeInput {
  progress: WordProgress;
  correct: boolean;
  now: Date;
}

/**
 * Applies a single quiz/review outcome to a progress record.
 *
 * - a correct answer increments the streak and pushes the next review further out
 * - a mistake resets the streak to 0 and schedules the word for tomorrow
 *
 * The function is pure: it returns a new record and never mutates its input.
 */
export function applyReviewOutcome({ progress, correct, now }: ReviewOutcomeInput): WordProgress {
  const reviewStreak = correct ? progress.reviewStreak + 1 : 0;

  const updated: WordProgress = {
    ...progress,
    timesSeen: progress.timesSeen + 1,
    quizAttempts: progress.quizAttempts + 1,
    correctAnswers: progress.correctAnswers + (correct ? 1 : 0),
    mistakeCount: progress.mistakeCount + (correct ? 0 : 1),
    reviewStreak,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: addDays(now, intervalDaysForStreak(reviewStreak)).toISOString(),
    updatedAt: now.toISOString(),
  };

  updated.status = nextStatus(updated, correct);
  if (!correct) {
    // Repeatedly missed words are surfaced as "difficult" automatically.
    updated.difficult = updated.difficult || updated.mistakeCount >= 3;
  }
  return updated;
}

/** Marks a word as seen (e.g. its detail page was opened) without grading it. */
export function markSeen(progress: WordProgress, now: Date): WordProgress {
  return {
    ...progress,
    timesSeen: progress.timesSeen + 1,
    status: progress.status === 'new' ? 'learning' : progress.status,
    nextReviewAt:
      progress.nextReviewAt ?? addDays(now, intervalDaysForStreak(0)).toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** How many days overdue a word is; 0 when not due. */
export function overdueDays(progress: WordProgress, now: Date): number {
  if (!progress.nextReviewAt) return 0;
  const due = Date.parse(progress.nextReviewAt);
  if (!Number.isFinite(due) || due > now.getTime()) return 0;
  return (now.getTime() - due) / DAY_MS;
}

export const WEAKNESS_WEIGHTS = {
  mistakeCount: 2,
  recentMistake: 6,
  lowAccuracy: 8,
  overdue: 1.5,
  difficultFlag: 4,
  recentCorrectPenalty: 3,
} as const;

/** Mistakes within this window count as "recent". */
export const RECENT_MISTAKE_WINDOW_DAYS = 7;

/**
 * Deterministic weakness score. Higher means the learner needs this word more.
 * Words never attempted score 0 so that the review queue stays focused on
 * material the learner has actually struggled with.
 */
export function weaknessScore(progress: WordProgress, now: Date): number {
  if (progress.quizAttempts === 0) return 0;

  const acc = accuracy(progress);
  const mistakeTerm = Math.min(progress.mistakeCount, 10) * WEAKNESS_WEIGHTS.mistakeCount;
  const lowAccuracyTerm = (1 - acc) * WEAKNESS_WEIGHTS.lowAccuracy;
  const overdueTerm = Math.min(overdueDays(progress, now), 14) * WEAKNESS_WEIGHTS.overdue;
  const difficultTerm = progress.difficult ? WEAKNESS_WEIGHTS.difficultFlag : 0;

  let recentMistakeTerm = 0;
  if (progress.mistakeCount > 0 && progress.lastReviewedAt && progress.reviewStreak === 0) {
    const ageDays = (now.getTime() - Date.parse(progress.lastReviewedAt)) / DAY_MS;
    if (Number.isFinite(ageDays) && ageDays <= RECENT_MISTAKE_WINDOW_DAYS) {
      recentMistakeTerm = WEAKNESS_WEIGHTS.recentMistake;
    }
  }

  const recentCorrectPenalty =
    Math.min(progress.reviewStreak, 4) * WEAKNESS_WEIGHTS.recentCorrectPenalty;

  const score =
    mistakeTerm + recentMistakeTerm + lowAccuracyTerm + overdueTerm + difficultTerm -
    recentCorrectPenalty;

  return Math.max(0, Number(score.toFixed(4)));
}

/** Sorts weakest-first; ties broken by wordId so ordering is stable. */
export function rankByWeakness(entries: WordProgress[], now: Date): WordProgress[] {
  return [...entries].sort((a, b) => {
    const diff = weaknessScore(b, now) - weaknessScore(a, now);
    if (Math.abs(diff) > 1e-9) return diff;
    return a.wordId.localeCompare(b.wordId);
  });
}

/** Words whose scheduled review time has arrived, most overdue first. */
export function dueForReview(entries: WordProgress[], now: Date): WordProgress[] {
  return entries
    .filter((entry) => overdueDays(entry, now) > 0 || isDueExactly(entry, now))
    .sort((a, b) => overdueDays(b, now) - overdueDays(a, now));
}

function isDueExactly(progress: WordProgress, now: Date): boolean {
  if (!progress.nextReviewAt) return false;
  const due = Date.parse(progress.nextReviewAt);
  return Number.isFinite(due) && due <= now.getTime();
}
