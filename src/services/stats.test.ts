import { describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { computeStats, computeStreakDays, strongWords, weakWords } from './stats';

const entries = await loadVocabulary();
const NOW = new Date('2026-03-10T12:00:00.000Z');
const DAY = 86_400_000;

function progressFor(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress(wordId, NOW.toISOString()), ...overrides };
}

describe('computeStats', () => {
  it('counts every unrecorded word as new', () => {
    const stats = computeStats({ entries, progress: [], now: NOW });
    expect(stats.totalWords).toBe(entries.length);
    expect(stats.statusCounts.new).toBe(entries.length);
    expect(stats.studiedWords).toBe(0);
  });

  it('tallies statuses, bookmarks and difficult flags', () => {
    const progress = [
      progressFor('w_consolidate', { status: 'mastered', bookmarked: true }),
      progressFor('w_infer', { status: 'learning', difficult: true }),
      progressFor('w_imply', { status: 'reviewing' }),
    ];
    const stats = computeStats({ entries, progress, now: NOW });

    expect(stats.statusCounts.mastered).toBe(1);
    expect(stats.statusCounts.learning).toBe(1);
    expect(stats.statusCounts.reviewing).toBe(1);
    expect(stats.statusCounts.new).toBe(entries.length - 3);
    expect(stats.bookmarked).toBe(1);
    expect(stats.difficult).toBe(1);
    expect(stats.studiedWords).toBe(3);
  });

  it('counts due reviews', () => {
    const progress = [
      progressFor('w_consolidate', { nextReviewAt: new Date(NOW.getTime() - DAY).toISOString() }),
      progressFor('w_infer', { nextReviewAt: new Date(NOW.getTime() + DAY).toISOString() }),
    ];
    expect(computeStats({ entries, progress, now: NOW }).dueForReview).toBe(1);
  });

  it('derives overall accuracy from counters when signed out', () => {
    const progress = [
      progressFor('w_consolidate', { quizAttempts: 10, correctAnswers: 7 }),
      progressFor('w_infer', { quizAttempts: 10, correctAnswers: 3 }),
    ];
    const stats = computeStats({ entries, progress, now: NOW });
    expect(stats.totalQuestionsAnswered).toBe(20);
    expect(stats.totalCorrectAnswers).toBe(10);
    expect(stats.overallAccuracy).toBe(0.5);
  });

  it('prefers server-side totals when they are available', () => {
    const stats = computeStats({
      entries,
      progress: [progressFor('w_consolidate', { quizAttempts: 1, correctAnswers: 1 })],
      now: NOW,
      serverStats: {
        quizzesCompleted: 4,
        totalQuestionsAnswered: 40,
        totalCorrectAnswers: 30,
        accuracyByCefr: { C1: { attempts: 40, correct: 30 } },
        accuracyByQuestionType: { cloze: { attempts: 40, correct: 30 } },
        recentActivity: [{ date: '2026-03-10', answered: 5, correct: 4 }],
      },
    });

    expect(stats.quizzesCompleted).toBe(4);
    expect(stats.totalQuestionsAnswered).toBe(40);
    expect(stats.overallAccuracy).toBe(0.75);
    expect(stats.accuracyByCefr.C1).toEqual({ attempts: 40, correct: 30 });
    expect(stats.accuracyByQuestionType.cloze).toEqual({ attempts: 40, correct: 30 });
    expect(stats.recentActivity).toHaveLength(1);
  });

  it('returns zero rather than NaN when nothing has been answered', () => {
    expect(computeStats({ entries, progress: [], now: NOW }).overallAccuracy).toBe(0);
  });

  it('builds a dense 14-day activity series when signed out', () => {
    const stats = computeStats({ entries, progress: [], now: NOW });
    expect(stats.recentActivity).toHaveLength(14);
    expect(stats.recentActivity.at(-1)?.date).toBe('2026-03-10');
  });
});

describe('computeStreakDays', () => {
  it('is zero with no review history', () => {
    expect(computeStreakDays([], NOW)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const progress = [0, 1, 2].map((offset) =>
      progressFor(`w_${offset}`, {
        lastReviewedAt: new Date(NOW.getTime() - offset * DAY).toISOString(),
      }),
    );
    expect(computeStreakDays(progress, NOW)).toBe(3);
  });

  it('allows yesterday as the anchor so a streak is not lost mid-day', () => {
    const progress = [1, 2].map((offset) =>
      progressFor(`w_${offset}`, {
        lastReviewedAt: new Date(NOW.getTime() - offset * DAY).toISOString(),
      }),
    );
    expect(computeStreakDays(progress, NOW)).toBe(2);
  });

  it('breaks the streak when a day is skipped', () => {
    const progress = [0, 2, 3].map((offset) =>
      progressFor(`w_${offset}`, {
        lastReviewedAt: new Date(NOW.getTime() - offset * DAY).toISOString(),
      }),
    );
    expect(computeStreakDays(progress, NOW)).toBe(1);
  });

  it('is zero when the last review was long ago', () => {
    const progress = [progressFor('w_a', { lastReviewedAt: '2025-01-01T00:00:00.000Z' })];
    expect(computeStreakDays(progress, NOW)).toBe(0);
  });
});

describe('weakWords and strongWords', () => {
  it('excludes never-attempted words from the weak list', () => {
    const progress = [progressFor('w_consolidate')];
    expect(weakWords(entries, progress, NOW)).toEqual([]);
  });

  it('ranks the most-missed word first', () => {
    const progress = [
      progressFor('w_consolidate', { quizAttempts: 10, correctAnswers: 1, mistakeCount: 9 }),
      progressFor('w_infer', { quizAttempts: 10, correctAnswers: 8, mistakeCount: 2 }),
    ];
    const weak = weakWords(entries, progress, NOW);
    expect(weak[0]?.entry.id).toBe('w_consolidate');
  });

  it('ignores progress rows whose word is no longer in the corpus', () => {
    const progress = [
      progressFor('w_removed_word', { quizAttempts: 5, correctAnswers: 0, mistakeCount: 5 }),
    ];
    expect(weakWords(entries, progress, NOW)).toEqual([]);
  });

  it('respects the limit', () => {
    const progress = entries.slice(0, 12).map((entry) =>
      progressFor(entry.id, { quizAttempts: 5, correctAnswers: 1, mistakeCount: 4 }),
    );
    expect(weakWords(entries, progress, NOW, 5)).toHaveLength(5);
  });

  it('requires at least two attempts before a word counts as strong', () => {
    const progress = [progressFor('w_consolidate', { quizAttempts: 1, correctAnswers: 1 })];
    expect(strongWords(entries, progress)).toEqual([]);
  });

  it('ranks the highest accuracy first', () => {
    const progress = [
      progressFor('w_consolidate', { quizAttempts: 10, correctAnswers: 10, reviewStreak: 5 }),
      progressFor('w_infer', { quizAttempts: 10, correctAnswers: 5 }),
    ];
    expect(strongWords(entries, progress)[0]?.entry.id).toBe('w_consolidate');
  });
});
