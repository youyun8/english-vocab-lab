import { z } from 'zod';

/** Per-word learning progress. Shared verbatim between browser and Worker. */

export const learningStatuses = ['new', 'learning', 'reviewing', 'mastered'] as const;
export const learningStatusSchema = z.enum(learningStatuses);
export type LearningStatus = z.infer<typeof learningStatusSchema>;

export const learningStatusLabelZh: Record<LearningStatus, string> = {
  new: '未學習',
  learning: '學習中',
  reviewing: '複習中',
  mastered: '已精熟',
};

const isoDateTime = z.string().datetime({ offset: true }).or(z.iso.datetime());

export const wordProgressSchema = z.object({
  wordId: z.string().trim().min(1),
  status: learningStatusSchema,
  bookmarked: z.boolean(),
  difficult: z.boolean(),
  timesSeen: z.number().int().min(0),
  quizAttempts: z.number().int().min(0),
  correctAnswers: z.number().int().min(0),
  mistakeCount: z.number().int().min(0),
  reviewStreak: z.number().int().min(0),
  lastReviewedAt: isoDateTime.optional(),
  nextReviewAt: isoDateTime.optional(),
  updatedAt: isoDateTime,
});
export type WordProgress = z.infer<typeof wordProgressSchema>;

export function createEmptyProgress(wordId: string, now: string): WordProgress {
  return {
    wordId,
    status: 'new',
    bookmarked: false,
    difficult: false,
    timesSeen: 0,
    quizAttempts: 0,
    correctAnswers: 0,
    mistakeCount: 0,
    reviewStreak: 0,
    updatedAt: now,
  };
}

/**
 * Accuracy is always derived, never stored, so it cannot drift away from the
 * counters it is computed from.
 */
export function accuracy(progress: Pick<WordProgress, 'quizAttempts' | 'correctAnswers'>): number {
  if (progress.quizAttempts <= 0) return 0;
  return progress.correctAnswers / progress.quizAttempts;
}

export function hasBeenStudied(progress: WordProgress): boolean {
  return progress.status !== 'new' || progress.timesSeen > 0 || progress.quizAttempts > 0;
}

export function isDue(progress: WordProgress, now: Date): boolean {
  if (!progress.nextReviewAt) return false;
  const due = Date.parse(progress.nextReviewAt);
  return Number.isFinite(due) && due <= now.getTime();
}

/** Ordering used when the caller wants "most advanced state wins". */
const statusRank: Record<LearningStatus, number> = {
  new: 0,
  learning: 1,
  reviewing: 2,
  mastered: 3,
};

export function statusOrder(status: LearningStatus): number {
  return statusRank[status];
}

export function moreAdvancedStatus(a: LearningStatus, b: LearningStatus): LearningStatus {
  return statusRank[a] >= statusRank[b] ? a : b;
}
