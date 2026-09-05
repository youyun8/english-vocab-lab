import type { VocabularyEntry } from '@/domain/vocabulary';

/**
 * Client-side vocabulary search.
 *
 * A small inverted-index-free scorer is enough for a corpus of a few thousand
 * entries and avoids pulling in a full-text search dependency. Fields are
 * weighted so that a lemma match always outranks a match buried in an example.
 */

export interface SearchHit {
  entry: VocabularyEntry;
  score: number;
}

const FIELD_WEIGHTS = {
  lemmaExact: 100,
  lemmaPrefix: 60,
  lemmaContains: 40,
  wordFamily: 25,
  definitionZh: 20,
  definitionEn: 16,
  synonym: 14,
  tag: 12,
  collocation: 10,
  grammarPattern: 8,
  usageExplanation: 5,
} as const;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Builds the searchable text of an entry once, then caches it on a WeakMap. */
const haystackCache = new WeakMap<VocabularyEntry, EntryHaystack>();

interface EntryHaystack {
  lemma: string;
  definitionsZh: string;
  definitionsEn: string;
  synonyms: string;
  tags: string;
  collocations: string;
  grammarPatterns: string;
  usageExplanations: string;
  wordFamily: string;
}

function haystack(entry: VocabularyEntry): EntryHaystack {
  const cached = haystackCache.get(entry);
  if (cached) return cached;

  const built: EntryHaystack = {
    lemma: normalize(entry.lemma),
    definitionsZh: entry.senses.map((s) => s.definitionZh).join(' ').toLowerCase(),
    definitionsEn: entry.senses.map((s) => s.definitionEn).join(' ').toLowerCase(),
    synonyms: [...(entry.synonyms ?? []), ...(entry.antonyms ?? [])]
      .map((r) => r.lemma)
      .join(' ')
      .toLowerCase(),
    tags: entry.tags.join(' ').toLowerCase(),
    collocations: entry.senses
      .flatMap((s) => s.collocations ?? [])
      .map((c) => `${c.text} ${c.meaningZh ?? ''}`)
      .join(' ')
      .toLowerCase(),
    grammarPatterns: entry.senses
      .flatMap((s) => s.grammarPatterns ?? [])
      .join(' ')
      .toLowerCase(),
    usageExplanations: entry.senses.map((s) => s.usageExplanationZh).join(' ').toLowerCase(),
    wordFamily: (entry.wordFamily ?? []).map((w) => w.lemma).join(' ').toLowerCase(),
  };
  haystackCache.set(entry, built);
  return built;
}

function scoreEntry(entry: VocabularyEntry, query: string): number {
  const hay = haystack(entry);
  let score = 0;

  if (hay.lemma === query) {
    score += FIELD_WEIGHTS.lemmaExact;
  } else if (hay.lemma.startsWith(query)) {
    score += FIELD_WEIGHTS.lemmaPrefix;
  } else if (hay.lemma.includes(query)) {
    score += FIELD_WEIGHTS.lemmaContains;
  }

  if (hay.wordFamily.includes(query)) score += FIELD_WEIGHTS.wordFamily;
  if (hay.definitionsZh.includes(query)) score += FIELD_WEIGHTS.definitionZh;
  if (hay.definitionsEn.includes(query)) score += FIELD_WEIGHTS.definitionEn;
  if (hay.synonyms.includes(query)) score += FIELD_WEIGHTS.synonym;
  if (hay.tags.includes(query)) score += FIELD_WEIGHTS.tag;
  if (hay.collocations.includes(query)) score += FIELD_WEIGHTS.collocation;
  if (hay.grammarPatterns.includes(query)) score += FIELD_WEIGHTS.grammarPattern;
  if (hay.usageExplanations.includes(query)) score += FIELD_WEIGHTS.usageExplanation;

  return score;
}

/**
 * Ranked search. An empty query returns an empty result set so that callers can
 * distinguish "no query" from "no matches".
 */
export function searchVocabulary(entries: VocabularyEntry[], rawQuery: string): SearchHit[] {
  const query = normalize(rawQuery);
  if (!query) return [];

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, query);
    if (score > 0) hits.push({ entry, score });
  }

  return hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.lemma.localeCompare(b.entry.lemma);
  });
}
