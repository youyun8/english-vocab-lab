import type { CefrLevel } from './vocabulary';
import type { QuestionType } from './quiz';
import type { LearningStatus } from './progress';

/** Aggregate learning statistics, computed identically on client and server. */
export interface StatusCounts {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
}

export interface AccuracyBucket {
  attempts: number;
  correct: number;
}

export interface ActivityPoint {
  /** `YYYY-MM-DD` in UTC. */
  date: string;
  answered: number;
  correct: number;
}

export interface LearningStats {
  totalWords: number;
  statusCounts: StatusCounts;
  bookmarked: number;
  difficult: number;
  dueForReview: number;
  studiedWords: number;
  quizzesCompleted: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracy: number;
  currentStreakDays: number;
  accuracyByCefr: Record<CefrLevel, AccuracyBucket>;
  accuracyByQuestionType: Partial<Record<QuestionType, AccuracyBucket>>;
  recentActivity: ActivityPoint[];
}

export function emptyStatusCounts(): StatusCounts {
  return { new: 0, learning: 0, reviewing: 0, mastered: 0 };
}

export function bumpStatus(counts: StatusCounts, status: LearningStatus): void {
  counts[status] += 1;
}

export function bucketAccuracy(bucket: AccuracyBucket | undefined): number {
  if (!bucket || bucket.attempts === 0) return 0;
  return bucket.correct / bucket.attempts;
}
