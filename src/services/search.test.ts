import { describe, expect, it } from 'vitest';

import { loadSearchText, loadVocabularyIndex } from '@/data';
import { searchVocabulary } from './search';

// Search runs over the index; the deeper prose is a second file the app only
// downloads once a query is typed, so both are loaded here.
const summaries = await loadVocabularyIndex();
const deepText = await loadSearchText();

function lemmas(query: string): string[] {
  return searchVocabulary(summaries, query, deepText).map((hit) => hit.summary.lemma);
}

describe('searchVocabulary', () => {
  it('returns nothing for an empty or whitespace query', () => {
    expect(searchVocabulary(summaries, '', deepText)).toEqual([]);
    expect(searchVocabulary(summaries, '   ', deepText)).toEqual([]);
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
    const hits = searchVocabulary(summaries, 'in', deepText);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it('breaks score ties alphabetically for a stable order', () => {
    const first = searchVocabulary(summaries, 'academic', deepText).map((hit) => hit.summary.lemma);
    const second = searchVocabulary(summaries, 'academic', deepText).map((hit) => hit.summary.lemma);
    expect(first).toEqual(second);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchVocabulary(summaries, 'zzzzqqqqxxxx', deepText)).toEqual([]);
  });
});

describe('searchVocabulary without the deep text', () => {
  it('still matches headwords, glosses and tags', () => {
    const shallow = (query: string) =>
      searchVocabulary(summaries, query).map((hit) => hit.summary.lemma);
    expect(shallow('consolidate')).toContain('consolidate');
    expect(shallow('整合')).toContain('consolidate');
    expect(shallow('toefl').length).toBeGreaterThan(0);
  });

  it('finds deep matches only once the deep text is supplied', () => {
    const query = 'eliminate the need for';
    expect(searchVocabulary(summaries, query)).toEqual([]);
    expect(searchVocabulary(summaries, query, deepText).map((hit) => hit.summary.lemma))
      .toContain('eliminate');
  });
});
