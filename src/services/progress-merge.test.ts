import { describe, expect, it } from 'vitest';

import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { mergeProgressSets, mergeWordProgress } from './progress-merge';

const T0 = '2026-02-01T00:00:00.000Z';
const T1 = '2026-02-10T00:00:00.000Z';
const T2 = '2026-02-20T00:00:00.000Z';

function progress(overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress('w_consolidate', T0), ...overrides };
}

describe('mergeWordProgress', () => {
  it('ORs the bookmark and difficult flags so a flag is never lost', () => {
    const merged = mergeWordProgress(
      progress({ bookmarked: true, difficult: false }),
      progress({ bookmarked: false, difficult: true }),
    );
    expect(merged.bookmarked).toBe(true);
    expect(merged.difficult).toBe(true);
  });

  it('takes the maximum of each counter rather than summing them', () => {
    const merged = mergeWordProgress(
      progress({ timesSeen: 5, quizAttempts: 4, correctAnswers: 3, mistakeCount: 1 }),
      progress({ timesSeen: 2, quizAttempts: 6, correctAnswers: 2, mistakeCount: 4 }),
    );
    expect(merged.timesSeen).toBe(5);
    expect(merged.quizAttempts).toBe(6);
    expect(merged.correctAnswers).toBe(3);
    expect(merged.mistakeCount).toBe(4);
  });

  it('never lets correctAnswers exceed quizAttempts after merging', () => {
    const merged = mergeWordProgress(
      progress({ quizAttempts: 2, correctAnswers: 2 }),
      progress({ quizAttempts: 1, correctAnswers: 1 }),
    );
    expect(merged.correctAnswers).toBeLessThanOrEqual(merged.quizAttempts);
  });

  it('keeps the more advanced learning status', () => {
    expect(
      mergeWordProgress(progress({ status: 'learning' }), progress({ status: 'reviewing' })).status,
    ).toBe('reviewing');
  });

  it('demotes an unearned "mastered" claim to "reviewing"', () => {
    // Local says mastered, but the merged counters do not support it.
    const merged = mergeWordProgress(
      progress({ status: 'mastered', reviewStreak: 1, quizAttempts: 10, correctAnswers: 3 }),
      progress({ status: 'learning', reviewStreak: 0, quizAttempts: 10, correctAnswers: 3 }),
    );
    expect(merged.status).toBe('reviewing');
  });

  it('keeps a genuinely earned "mastered" status', () => {
    const merged = mergeWordProgress(
      progress({ status: 'mastered', reviewStreak: 5, quizAttempts: 10, correctAnswers: 10 }),
      progress({ status: 'reviewing', reviewStreak: 4, quizAttempts: 8, correctAnswers: 8 }),
    );
    expect(merged.status).toBe('mastered');
  });

  it('keeps the later lastReviewedAt and the EARLIER nextReviewAt', () => {
    const merged = mergeWordProgress(
      progress({ lastReviewedAt: T1, nextReviewAt: T2 }),
      progress({ lastReviewedAt: T0, nextReviewAt: T1 }),
    );
    // Reviewing early is harmless; skipping a due review is not.
    expect(merged.lastReviewedAt).toBe(T1);
    expect(merged.nextReviewAt).toBe(T1);
  });

  it('is commutative', () => {
    const local = progress({
      bookmarked: true,
      timesSeen: 3,
      quizAttempts: 5,
      correctAnswers: 4,
      reviewStreak: 2,
      lastReviewedAt: T1,
      nextReviewAt: T2,
      updatedAt: T1,
    });
    const cloud = progress({
      difficult: true,
      timesSeen: 7,
      quizAttempts: 3,
      correctAnswers: 1,
      mistakeCount: 2,
      lastReviewedAt: T0,
      nextReviewAt: T1,
      updatedAt: T2,
    });
    expect(mergeWordProgress(local, cloud)).toEqual(mergeWordProgress(cloud, local));
  });

  it('is idempotent — merging a second time changes nothing', () => {
    const local = progress({ bookmarked: true, quizAttempts: 4, correctAnswers: 3, updatedAt: T1 });
    const cloud = progress({ difficult: true, quizAttempts: 2, mistakeCount: 1, updatedAt: T2 });

    const once = mergeWordProgress(local, cloud);
    const twice = mergeWordProgress(local, once);
    expect(twice).toEqual(once);
  });
});

describe('mergeProgressSets', () => {
  it('adds local-only words and reports them as created', () => {
    const result = mergeProgressSets(
      [progress({ wordId: 'w_a', bookmarked: true })],
      [progress({ wordId: 'w_b' })],
    );
    expect(result.merged.map((item) => item.wordId)).toEqual(['w_a', 'w_b']);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('counts a word as updated only when the merge actually changed it', () => {
    const identical = progress({ wordId: 'w_a', quizAttempts: 2, correctAnswers: 1 });
    const noChange = mergeProgressSets([identical], [identical]);
    expect(noChange.updated).toBe(0);

    const changed = mergeProgressSets(
      [progress({ wordId: 'w_a', quizAttempts: 5, correctAnswers: 4 })],
      [progress({ wordId: 'w_a', quizAttempts: 2, correctAnswers: 1 })],
    );
    expect(changed.updated).toBe(1);
  });

  it('leaves cloud-only words untouched', () => {
    const cloudOnly = progress({ wordId: 'w_cloud', quizAttempts: 9, correctAnswers: 8 });
    const result = mergeProgressSets([], [cloudOnly]);
    expect(result.merged).toEqual([cloudOnly]);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('produces the same result when applied twice (safe to retry an import)', () => {
    const local = [progress({ wordId: 'w_a', quizAttempts: 4, correctAnswers: 3, bookmarked: true })];
    const cloud = [progress({ wordId: 'w_a', quizAttempts: 2, mistakeCount: 1 })];

    const first = mergeProgressSets(local, cloud);
    const second = mergeProgressSets(local, first.merged);
    expect(second.merged).toEqual(first.merged);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
  });
});
