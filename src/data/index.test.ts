import { describe, expect, it } from 'vitest';

import { searchTextOf, summarize } from '@/domain/vocabulary';
import {
  loadChunk,
  loadEntriesByIds,
  loadSearchText,
  loadVocabulary,
  loadVocabularyIndex,
} from './index';

/**
 * The index is what the app downloads; the chunks are what it downloads *only*
 * for the words a learner opens. These tests hold that contract: the index has
 * to describe every word exactly as its full entry would, and a word's chunk
 * has to be the file that actually contains it — otherwise the app would show
 * a word it can never open.
 */

const summaries = await loadVocabularyIndex();
const entries = await loadVocabulary();
const deepText = await loadSearchText();
const byId = new Map(entries.map((entry) => [entry.id, entry]));

describe('vocabulary index', () => {
  it('has one row per shipped word', () => {
    expect(summaries).toHaveLength(entries.length);
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(summaries.length);
    for (const summary of summaries) {
      expect(byId.has(summary.id), summary.id).toBe(true);
    }
  });

  it('is sorted alphabetically, which is the word bank default order', () => {
    const lemmas = summaries.map((summary) => summary.lemma);
    expect([...lemmas].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(lemmas);
  });

  it('describes each word exactly as its full entry does', () => {
    for (const summary of summaries) {
      const entry = byId.get(summary.id)!;
      expect(summary, summary.id).toEqual(summarize(entry, summary.chunk));
    }
  });

  it('points every word at the chunk that really contains it', async () => {
    const sample = [summaries[0]!, summaries[Math.floor(summaries.length / 2)]!, summaries.at(-1)!];
    for (const summary of sample) {
      const chunk = await loadChunk(summary.chunk);
      expect(chunk.map((entry) => entry.id), summary.chunk).toContain(summary.id);
    }
  });
});

describe('loadEntriesByIds', () => {
  it('returns the requested entries in the requested order', async () => {
    const ids = [summaries[5]!.id, summaries[0]!.id, summaries[3]!.id];
    const loaded = await loadEntriesByIds(ids);
    expect(loaded.map((entry) => entry.id)).toEqual(ids);
  });

  it('skips ids the corpus does not have', async () => {
    const loaded = await loadEntriesByIds(['w_not_a_real_word', summaries[0]!.id]);
    expect(loaded.map((entry) => entry.id)).toEqual([summaries[0]!.id]);
  });

  it('returns nothing for an empty request without touching the index', async () => {
    expect(await loadEntriesByIds([])).toEqual([]);
  });

  it('loads full entries, not index records', async () => {
    const entry = (await loadEntriesByIds([summaries[0]!.id]))[0]!;
    expect(entry.senses.length).toBeGreaterThan(0);
    expect(entry.pronunciation.kk).toBe(summaries[0]!.kk);
  });
});

describe('search text file', () => {
  it('carries the prose the index row leaves out', () => {
    for (const entry of entries.slice(0, 50)) {
      const expected = searchTextOf(entry);
      if (expected) expect(deepText.get(entry.id), entry.lemma).toBe(expected);
    }
  });

  it('covers the curated lessons, whose usage notes are worth searching', () => {
    const curated = entries.filter((entry) => !entry.dictionarySource);
    for (const entry of curated) {
      expect(deepText.get(entry.id)?.length ?? 0, entry.lemma).toBeGreaterThan(0);
    }
  });
});
