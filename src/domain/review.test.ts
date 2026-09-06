import { describe, expect, it } from 'vitest';

import { createEmptyProgress, accuracy, type WordProgress } from './progress';
import {
  DAY_MS,
  DEFAULT_REVIEW_INTERVALS_DAYS,
  applyReviewOutcome,
  dueForReview,
  intervalDaysForStreak,
  markSeen,
  masteryStreak,
  overdueDays,
  rankByWeakness,
  weaknessScore,
} from './review';

const NOW = new Date('2026-03-01T09:00:00.000Z');

function base(overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress('w_test', NOW.toISOString()), ...overrides };
}

function daysBetween(from: Date, iso: string | undefined): number {
  if (!iso) return Number.NaN;
  return Math.round((Date.parse(iso) - from.getTime()) / DAY_MS);
}

describe('intervalDaysForStreak', () => {
  it('follows the documented 1 / 3 / 7 / 14 / 30 ladder', () => {
    expect(intervalDaysForStreak(0)).toBe(1);
    expect(intervalDaysForStreak(1)).toBe(3);
    expect(intervalDaysForStreak(2)).toBe(7);
    expect(intervalDaysForStreak(3)).toBe(14);
    expect(intervalDaysForStreak(4)).toBe(30);
  });

  it('clamps rather than overflowing for very long streaks', () => {
    expect(intervalDaysForStreak(99)).toBe(30);
    expect(intervalDaysForStreak(-5)).toBe(1);
  });
});

describe('configurable review ladders', () => {
  const intensive = [1, 2, 4, 8, 16];
  const short = [3, 10];

  it('reads the interval from the ladder it is given', () => {
    expect(intervalDaysForStreak(0, intensive)).toBe(1);
    expect(intervalDaysForStreak(2, intensive)).toBe(4);
    expect(intervalDaysForStreak(4, intensive)).toBe(16);
    expect(intervalDaysForStreak(9, intensive)).toBe(16);
  });

  it('defaults to the standard ladder when none is given', () => {
    expect(intervalDaysForStreak(1)).toBe(3);
    expect(DEFAULT_REVIEW_INTERVALS_DAYS).toEqual([1, 3, 7, 14, 30]);
  });

  it('falls back to the standard ladder rather than crashing on an empty one', () => {
    expect(intervalDaysForStreak(1, [])).toBe(3);
  });

  it('schedules using the learner’s ladder', () => {
    const after = applyReviewOutcome({
      progress: base(),
      correct: true,
      now: NOW,
      intervals: intensive,
    });
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(2);
  });

  it('uses the learner’s ladder for a mistake too', () => {
    const after = applyReviewOutcome({
      progress: base({ reviewStreak: 3 }),
      correct: false,
      now: NOW,
      intervals: [5, 12, 30],
    });
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(5);
  });

  it('derives the mastery streak from the ladder length', () => {
    expect(masteryStreak()).toBe(4);
    expect(masteryStreak(intensive)).toBe(4);
    expect(masteryStreak(short)).toBe(1);
    expect(masteryStreak([7])).toBe(1);
  });

  it('reaches mastery sooner on a shorter ladder', () => {
    let progress = base();
    for (let i = 0; i < 2; i += 1) {
      progress = applyReviewOutcome({ progress, correct: true, now: NOW, intervals: short });
    }
    expect(progress.status).toBe('mastered');

    // The same two correct answers on the default ladder are not enough.
    let onDefault = base();
    for (let i = 0; i < 2; i += 1) {
      onDefault = applyReviewOutcome({ progress: onDefault, correct: true, now: NOW });
    }
    expect(onDefault.status).toBe('reviewing');
  });

  it('uses the ladder when scheduling a first sighting', () => {
    expect(daysBetween(NOW, markSeen(base(), NOW, [4, 9]).nextReviewAt)).toBe(4);
  });
});

describe('applyReviewOutcome', () => {
  it('schedules a new mistake for tomorrow and resets the streak', () => {
    const before = base({ reviewStreak: 3, status: 'reviewing' });
    const after = applyReviewOutcome({ progress: before, correct: false, now: NOW });

    expect(after.reviewStreak).toBe(0);
    expect(after.mistakeCount).toBe(1);
    expect(after.status).toBe('learning');
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(1);
  });

  it('moves the first correct answer out to three days and enters the review cycle', () => {
    const after = applyReviewOutcome({ progress: base(), correct: true, now: NOW });

    expect(after.reviewStreak).toBe(1);
    expect(after.correctAnswers).toBe(1);
    // One consecutive correct answer is enough to leave "learning".
    expect(after.status).toBe('reviewing');
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(3);
  });

  it('lengthens the interval on repeated correct answers', () => {
    let progress = base();
    const expected = [3, 7, 14, 30];

    for (const days of expected) {
      progress = applyReviewOutcome({ progress, correct: true, now: NOW });
      expect(daysBetween(NOW, progress.nextReviewAt)).toBe(days);
    }
    expect(progress.reviewStreak).toBe(4);
  });

  it('marks a word mastered only once the streak and accuracy both qualify', () => {
    let progress = base();
    for (let i = 0; i < 5; i += 1) {
      progress = applyReviewOutcome({ progress, correct: true, now: NOW });
    }
    expect(progress.reviewStreak).toBe(5);
    expect(accuracy(progress)).toBe(1);
    expect(progress.status).toBe('mastered');
  });

  it('does not master a word whose overall accuracy is poor', () => {
    // Many past mistakes: even a 4-long streak should not qualify yet.
    let progress = base({ quizAttempts: 20, correctAnswers: 4, mistakeCount: 16 });
    for (let i = 0; i < 4; i += 1) {
      progress = applyReviewOutcome({ progress, correct: true, now: NOW });
    }
    expect(progress.reviewStreak).toBe(4);
    expect(accuracy(progress)).toBeLessThan(0.8);
    expect(progress.status).toBe('reviewing');
  });

  it('pulls a mastered word back into learning after a mistake', () => {
    const mastered = base({ status: 'mastered', reviewStreak: 6, quizAttempts: 8, correctAnswers: 8 });
    const after = applyReviewOutcome({ progress: mastered, correct: false, now: NOW });

    expect(after.status).toBe('learning');
    expect(after.reviewStreak).toBe(0);
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(1);
  });

  it('auto-flags a word as difficult after three mistakes', () => {
    let progress = base();
    for (let i = 0; i < 2; i += 1) {
      progress = applyReviewOutcome({ progress, correct: false, now: NOW });
    }
    expect(progress.difficult).toBe(false);

    progress = applyReviewOutcome({ progress, correct: false, now: NOW });
    expect(progress.mistakeCount).toBe(3);
    expect(progress.difficult).toBe(true);
  });

  it('never mutates its input', () => {
    const before = base();
    const snapshot = { ...before };
    applyReviewOutcome({ progress: before, correct: true, now: NOW });
    expect(before).toEqual(snapshot);
  });
});

describe('markSeen', () => {
  it('promotes a new word to learning and schedules a first review', () => {
    const after = markSeen(base(), NOW);
    expect(after.status).toBe('learning');
    expect(after.timesSeen).toBe(1);
    expect(daysBetween(NOW, after.nextReviewAt)).toBe(1);
  });

  it('does not reschedule a word that already has a review date', () => {
    const scheduled = base({
      status: 'reviewing',
      nextReviewAt: new Date(NOW.getTime() + 10 * DAY_MS).toISOString(),
    });
    const after = markSeen(scheduled, NOW);
    expect(after.nextReviewAt).toBe(scheduled.nextReviewAt);
    expect(after.status).toBe('reviewing');
  });
});

describe('overdueDays and dueForReview', () => {
  it('reports zero when a review is still in the future', () => {
    const future = base({ nextReviewAt: new Date(NOW.getTime() + DAY_MS).toISOString() });
    expect(overdueDays(future, NOW)).toBe(0);
  });

  it('measures how far past due a word is', () => {
    const overdue = base({ nextReviewAt: new Date(NOW.getTime() - 3 * DAY_MS).toISOString() });
    expect(overdueDays(overdue, NOW)).toBeCloseTo(3, 5);
  });

  it('returns the most overdue words first', () => {
    const items = [
      base({ wordId: 'a', nextReviewAt: new Date(NOW.getTime() - DAY_MS).toISOString() }),
      base({ wordId: 'b', nextReviewAt: new Date(NOW.getTime() - 9 * DAY_MS).toISOString() }),
      base({ wordId: 'c', nextReviewAt: new Date(NOW.getTime() + DAY_MS).toISOString() }),
    ];
    expect(dueForReview(items, NOW).map((item) => item.wordId)).toEqual(['b', 'a']);
  });
});

describe('weaknessScore', () => {
  it('is zero for a word that has never been attempted', () => {
    expect(weaknessScore(base(), NOW)).toBe(0);
  });

  it('ranks a frequently missed word above an occasionally missed one', () => {
    const bad = base({ wordId: 'bad', quizAttempts: 10, correctAnswers: 2, mistakeCount: 8 });
    const ok = base({ wordId: 'ok', quizAttempts: 10, correctAnswers: 9, mistakeCount: 1 });
    expect(weaknessScore(bad, NOW)).toBeGreaterThan(weaknessScore(ok, NOW));
  });

  it('adds weight for a recent unresolved mistake', () => {
    const recent = base({
      quizAttempts: 4,
      correctAnswers: 2,
      mistakeCount: 2,
      reviewStreak: 0,
      lastReviewedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
    });
    const stale = { ...recent, lastReviewedAt: new Date(NOW.getTime() - 60 * DAY_MS).toISOString() };
    expect(weaknessScore(recent, NOW)).toBeGreaterThan(weaknessScore(stale, NOW));
  });

  it('reduces the score as the learner builds a correct streak', () => {
    const struggling = base({ quizAttempts: 6, correctAnswers: 3, mistakeCount: 3, reviewStreak: 0 });
    const recovering = { ...struggling, reviewStreak: 4 };
    expect(weaknessScore(recovering, NOW)).toBeLessThan(weaknessScore(struggling, NOW));
  });

  it('never returns a negative score', () => {
    const strong = base({ quizAttempts: 20, correctAnswers: 20, mistakeCount: 0, reviewStreak: 10 });
    expect(weaknessScore(strong, NOW)).toBeGreaterThanOrEqual(0);
  });

  it('orders ties deterministically by word id', () => {
    const a = base({ wordId: 'w_b', quizAttempts: 2, correctAnswers: 1, mistakeCount: 1 });
    const b = base({ wordId: 'w_a', quizAttempts: 2, correctAnswers: 1, mistakeCount: 1 });
    expect(rankByWeakness([a, b], NOW).map((item) => item.wordId)).toEqual(['w_a', 'w_b']);
  });
});
