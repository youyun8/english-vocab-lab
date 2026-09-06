import { describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { DEFAULT_FILTERS, collectTags, filterEntries, type WordFilters } from './filtering';

const entries = await loadVocabulary();
const NOW = new Date('2026-03-01T00:00:00.000Z');

function run(overrides: Partial<WordFilters>, progress: WordProgress[] = []): string[] {
  return filterEntries({
    entries,
    progressByWordId: new Map(progress.map((item) => [item.wordId, item])),
    filters: { ...DEFAULT_FILTERS, ...overrides },
    now: NOW,
  }).map((entry) => entry.lemma);
}

function progressFor(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress(wordId, NOW.toISOString()), ...overrides };
}

describe('filterEntries', () => {
  it('returns everything with the default filters', () => {
    expect(run({})).toHaveLength(entries.length);
  });

  it('filters by CEFR level', () => {
    const c2 = filterEntries({
      entries,
      progressByWordId: new Map(),
      filters: { ...DEFAULT_FILTERS, cefrLevels: ['C2'] },
      now: NOW,
    });
    expect(c2.length).toBeGreaterThan(0);
    expect(c2.every((entry) => entry.cefr === 'C2')).toBe(true);
  });

  it('filters by part of speech', () => {
    const verbs = filterEntries({
      entries,
      progressByWordId: new Map(),
      filters: { ...DEFAULT_FILTERS, partsOfSpeech: ['verb'] },
      now: NOW,
    });
    expect(verbs.length).toBeGreaterThan(0);
    expect(
      verbs.every((entry) => entry.senses.some((sense) => sense.partOfSpeech === 'verb')),
    ).toBe(true);
  });

  it('filters by tag', () => {
    const tags = collectTags(entries);
    expect(tags.length).toBeGreaterThan(0);
    const tag = tags[0]!;
    const tagged = filterEntries({
      entries,
      progressByWordId: new Map(),
      filters: { ...DEFAULT_FILTERS, tags: [tag] },
      now: NOW,
    });
    expect(tagged.every((entry) => entry.tags.includes(tag))).toBe(true);
  });

  it('combines filters with AND semantics', () => {
    const both = filterEntries({
      entries,
      progressByWordId: new Map(),
      filters: { ...DEFAULT_FILTERS, cefrLevels: ['C1'], partsOfSpeech: ['adjective'] },
      now: NOW,
    });
    expect(
      both.every(
        (entry) =>
          entry.cefr === 'C1' && entry.senses.some((sense) => sense.partOfSpeech === 'adjective'),
      ),
    ).toBe(true);
  });

  it('filters by learning status, treating unrecorded words as new', () => {
    const progress = [progressFor('w_consolidate', { status: 'mastered' })];
    const mastered = run({ statuses: ['mastered'] }, progress);
    expect(mastered).toEqual(['consolidate']);

    const news = run({ statuses: ['new'] }, progress);
    expect(news).not.toContain('consolidate');
    expect(news.length).toBe(entries.length - 1);
  });

  it('filters the bookmarked and difficult flags', () => {
    const progress = [
      progressFor('w_consolidate', { bookmarked: true }),
      progressFor('w_infer', { difficult: true }),
      progressFor('w_imply', { status: 'mastered' }),
    ];
    expect(run({ bookmarkedOnly: true }, progress)).toEqual(['consolidate']);
    expect(run({ difficultOnly: true }, progress)).toEqual(['infer']);
    expect(run({ statuses: ['mastered'] }, progress)).toEqual(['imply']);
  });

  it('searches by keyword and keeps relevance order by default', () => {
    const results = run({ query: 'consolidate' });
    expect(results[0]).toBe('consolidate');
  });

  it('applies an explicit sort even when searching', () => {
    const results = run({ query: 'e', sort: 'cefr' });
    expect(results.length).toBeGreaterThan(1);
  });

  it('sorts alphabetically by default', () => {
    const results = run({});
    const sorted = [...results].sort((a, b) => a.localeCompare(b));
    expect(results).toEqual(sorted);
  });

  it('sorts by CEFR level, then alphabetically', () => {
    const sorted = filterEntries({
      entries,
      progressByWordId: new Map(),
      filters: { ...DEFAULT_FILTERS, sort: 'cefr' },
      now: NOW,
    });
    const order = { B2: 0, C1: 1, C2: 2 } as const;
    for (let i = 1; i < sorted.length; i += 1) {
      expect(order[sorted[i]!.cefr]).toBeGreaterThanOrEqual(order[sorted[i - 1]!.cefr]);
    }
  });

  it('sorts weakest first', () => {
    const progress = [
      progressFor('w_infer', { quizAttempts: 10, correctAnswers: 1, mistakeCount: 9 }),
      progressFor('w_imply', { quizAttempts: 10, correctAnswers: 9, mistakeCount: 1 }),
    ];
    const results = run({ sort: 'weakest' }, progress);
    expect(results[0]).toBe('infer');
  });

  it('sorts strongest first', () => {
    const progress = [
      progressFor('w_infer', { quizAttempts: 10, correctAnswers: 1, mistakeCount: 9 }),
      progressFor('w_imply', { quizAttempts: 10, correctAnswers: 10, reviewStreak: 5 }),
    ];
    const results = run({ sort: 'strongest' }, progress);
    expect(results[0]).toBe('imply');
  });

  it('sorts by most recently studied', () => {
    const progress = [
      progressFor('w_infer', { lastReviewedAt: '2026-02-01T00:00:00.000Z' }),
      progressFor('w_imply', { lastReviewedAt: '2026-02-20T00:00:00.000Z' }),
    ];
    const results = run({ sort: 'recent' }, progress);
    expect(results[0]).toBe('imply');
    expect(results[1]).toBe('infer');
  });

  it('returns an empty list when nothing matches', () => {
    expect(run({ query: 'zzzzzzz' })).toEqual([]);
  });
});

describe('collectTags', () => {
  it('returns unique tags in alphabetical order', () => {
    const tags = collectTags(entries);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toEqual([...tags].sort((a, b) => a.localeCompare(b)));
  });
});
