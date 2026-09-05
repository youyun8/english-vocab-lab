import { describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { searchVocabulary } from './search';

const entries = await loadVocabulary();

function lemmas(query: string): string[] {
  return searchVocabulary(entries, query).map((hit) => hit.entry.lemma);
}

describe('searchVocabulary', () => {
  it('returns nothing for an empty or whitespace query', () => {
    expect(searchVocabulary(entries, '')).toEqual([]);
    expect(searchVocabulary(entries, '   ')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(lemmas('CONSOLIDATE')).toContain('consolidate');
    expect(lemmas('consolidate')).toContain('consolidate');
  });

  it('matches partial words as a prefix', () => {
    expect(lemmas('conso')).toContain('consolidate');
  });

  it('matches a substring in the middle of a lemma', () => {
    expect(lemmas('solid')).toContain('consolidate');
  });

  it('ranks an exact lemma match first', () => {
    const results = lemmas('imply');
    expect(results[0]).toBe('imply');
  });

  it('searches Traditional Chinese definitions', () => {
    expect(lemmas('整合')).toContain('consolidate');
  });

  it('searches English definitions', () => {
    const results = lemmas('spaced repetition');
    // No entry defines that phrase, so the result set must be empty rather
    // than falling back to a fuzzy match.
    expect(results).toEqual([]);
    expect(lemmas('completely remove')).toContain('eliminate');
  });

  it('searches collocations', () => {
    expect(lemmas('eliminate the need for')).toContain('eliminate');
  });

  it('searches grammar patterns', () => {
    expect(lemmas('in preference to + noun')).toContain('preference');
    expect(lemmas('consolidate a into b')).toContain('consolidate');
  });

  it('searches tags', () => {
    const results = lemmas('security');
    expect(results.length).toBeGreaterThan(0);
    expect(results).toContain('validate');
  });

  it('searches synonyms and antonyms', () => {
    expect(lemmas('eradicate')).toContain('eliminate');
  });

  it('searches word families', () => {
    expect(lemmas('consolidation')).toContain('consolidate');
  });

  it('returns hits ordered by descending score', () => {
    const hits = searchVocabulary(entries, 'in');
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it('breaks score ties alphabetically for a stable order', () => {
    const first = searchVocabulary(entries, 'academic').map((hit) => hit.entry.lemma);
    const second = searchVocabulary(entries, 'academic').map((hit) => hit.entry.lemma);
    expect(first).toEqual(second);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchVocabulary(entries, 'zzzzqqqqxxxx')).toEqual([]);
  });
});
