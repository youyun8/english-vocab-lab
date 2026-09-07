import { describe, expect, it } from 'vitest';

import { loadSearchText, loadVocabularyIndex } from '@/data';
import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import {
  DEFAULT_FILTERS,
  collectTags,
  countActiveFilters,
  facetCounts,
  filterEntries,
  partitionTags,
  type WordFilters,
} from './filtering';

const entries = await loadVocabularyIndex();
const deepText = await loadSearchText();
const NOW = new Date('2026-03-01T00:00:00.000Z');

function run(overrides: Partial<WordFilters>, progress: WordProgress[] = []): string[] {
  return filterEntries({
    entries,
    progressByWordId: new Map(progress.map((item) => [item.wordId, item])),
    filters: { ...DEFAULT_FILTERS, ...overrides },
    now: NOW,
    deepText,
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
      verbs.every((entry) => entry.partsOfSpeech.includes('verb')),
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
          entry.cefr === 'C1' && entry.partsOfSpeech.includes('adjective'),
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

describe('facetCounts', () => {
  const counts = (overrides: Partial<WordFilters>, progress: WordProgress[] = []) =>
    facetCounts({
      entries,
      progressByWordId: new Map(progress.map((item) => [item.wordId, item])),
      filters: { ...DEFAULT_FILTERS, ...overrides },
    });

  it('counts every level when nothing is filtered', () => {
    const all = counts({});
    for (const level of ['B2', 'C1', 'C2'] as const) {
      expect(all.cefrLevels.get(level)).toBe(
        entries.filter((entry) => entry.cefr === level).length,
      );
    }
  });

  it('ignores a value\'s own group, so its siblings stay selectable', () => {
    const withC2 = counts({ cefrLevels: ['C2'] });
    // C1's count is what picking it *as well* would add, not zero.
    expect(withC2.cefrLevels.get('C1')).toBe(entries.filter((e) => e.cefr === 'C1').length);
    expect(withC2.cefrLevels.get('C2')).toBe(entries.filter((e) => e.cefr === 'C2').length);
  });

  it('narrows other groups by the filters that are applied', () => {
    const all = counts({});
    const withC2 = counts({ cefrLevels: ['C2'] });
    const verbsAll = all.partsOfSpeech.get('verb') ?? 0;
    const verbsC2 = withC2.partsOfSpeech.get('verb') ?? 0;
    expect(verbsC2).toBeGreaterThan(0);
    expect(verbsC2).toBeLessThan(verbsAll);
  });

  it('counts the bookmarked and difficult flags from progress', () => {
    const progress = [
      progressFor('w_consolidate', { bookmarked: true }),
      progressFor('w_infer', { difficult: true }),
    ];
    const flagged = counts({}, progress);
    expect(flagged.bookmarked).toBe(1);
    expect(flagged.difficult).toBe(1);
  });
});

describe('countActiveFilters', () => {
  it('counts nothing for the defaults', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it('counts every applied value, the query and a non-default sort', () => {
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        query: ' consolidate ',
        cefrLevels: ['B2', 'C1'],
        tags: ['toefl'],
        bookmarkedOnly: true,
        sort: 'weakest',
      }),
    ).toBe(6);
  });
});

describe('partitionTags', () => {
  it('separates the exam lists from editorial topics', () => {
    const { exam, topic } = partitionTags(collectTags(entries));
    expect(exam).toEqual(['toefl', 'gre', 'ielts', 'dictionary']);
    expect(topic).not.toContain('toefl');
    expect(topic.length).toBeGreaterThan(0);
  });
});
