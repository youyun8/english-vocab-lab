import {
  accuracy,
  moreAdvancedStatus,
  type WordProgress,
} from '@/domain/progress';

/**
 * Deterministic merge of anonymous (local) progress into a cloud account.
 *
 * Rules, applied per word id:
 *
 *  1. bookmarked  = local OR cloud          (a flag is never silently lost)
 *  2. difficult   = local OR cloud
 *  3. counters    = max(local, cloud) for every counter, never a sum. The two
 *                   datasets usually describe the *same* learner practising in
 *                   two places, so summing would double-count shared history.
 *                   `max` is idempotent, which makes a repeated merge a no-op.
 *  4. status      = the more advanced of the two, but never above what the
 *                   merged review streak justifies (see `cappedStatus`).
 *  5. lastReviewedAt  = the later of the two.
 *  6. nextReviewAt    = the EARLIER of the two. Reviewing slightly early is
 *                       harmless; skipping a due review is not.
 *  7. updatedAt   = the later of the two, so the merged record supersedes both.
 *
 * Because every rule is either `max`, `min`, `OR` or "pick the later
 * timestamp", the merge is commutative and idempotent: merging twice produces
 * exactly the same record as merging once. Callers additionally record an
 * import marker so the same local dataset is never re-imported into the same
 * account.
 */

function laterIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function earlierIso(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * A merged record must not claim to be `mastered` unless the merged counters
 * actually support it, otherwise a stale local record could promote a word the
 * learner is still getting wrong.
 */
function cappedStatus(merged: WordProgress): WordProgress['status'] {
  if (merged.status === 'mastered') {
    const healthy = merged.reviewStreak >= 4 && accuracy(merged) >= 0.8;
    return healthy ? 'mastered' : 'reviewing';
  }
  return merged.status;
}

export function mergeWordProgress(local: WordProgress, cloud: WordProgress): WordProgress {
  const merged: WordProgress = {
    wordId: cloud.wordId,
    status: moreAdvancedStatus(local.status, cloud.status),
    bookmarked: local.bookmarked || cloud.bookmarked,
    difficult: local.difficult || cloud.difficult,
    timesSeen: Math.max(local.timesSeen, cloud.timesSeen),
    quizAttempts: Math.max(local.quizAttempts, cloud.quizAttempts),
    correctAnswers: Math.max(local.correctAnswers, cloud.correctAnswers),
    mistakeCount: Math.max(local.mistakeCount, cloud.mistakeCount),
    reviewStreak: Math.max(local.reviewStreak, cloud.reviewStreak),
    lastReviewedAt: laterIso(local.lastReviewedAt, cloud.lastReviewedAt),
    nextReviewAt: earlierIso(local.nextReviewAt, cloud.nextReviewAt),
    updatedAt: laterIso(local.updatedAt, cloud.updatedAt) ?? cloud.updatedAt,
  };

  // `correctAnswers` can never exceed `quizAttempts` after taking two maxima
  // from different datasets; clamp so the invariant always holds.
  merged.correctAnswers = Math.min(merged.correctAnswers, merged.quizAttempts);
  merged.status = cappedStatus(merged);
  return merged;
}

export interface MergeResult {
  merged: WordProgress[];
  created: number;
  updated: number;
}

/** Merges a full local dataset into a full cloud dataset. */
export function mergeProgressSets(
  local: WordProgress[],
  cloud: WordProgress[],
): MergeResult {
  const cloudMap = new Map(cloud.map((item) => [item.wordId, item]));
  const result = new Map(cloudMap);

  let created = 0;
  let updated = 0;

  for (const localItem of local) {
    const cloudItem = cloudMap.get(localItem.wordId);
    if (!cloudItem) {
      result.set(localItem.wordId, localItem);
      created += 1;
      continue;
    }
    const merged = mergeWordProgress(localItem, cloudItem);
    result.set(localItem.wordId, merged);
    if (!isSameProgress(merged, cloudItem)) updated += 1;
  }

  return {
    merged: [...result.values()].sort((a, b) => a.wordId.localeCompare(b.wordId)),
    created,
    updated,
  };
}

function isSameProgress(a: WordProgress, b: WordProgress): boolean {
  return (
    a.status === b.status &&
    a.bookmarked === b.bookmarked &&
    a.difficult === b.difficult &&
    a.timesSeen === b.timesSeen &&
    a.quizAttempts === b.quizAttempts &&
    a.correctAnswers === b.correctAnswers &&
    a.mistakeCount === b.mistakeCount &&
    a.reviewStreak === b.reviewStreak &&
    a.lastReviewedAt === b.lastReviewedAt &&
    a.nextReviewAt === b.nextReviewAt
  );
}
