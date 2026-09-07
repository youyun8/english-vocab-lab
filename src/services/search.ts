import type { VocabularySummary } from '@/domain/vocabulary';

/**
 * Client-side vocabulary search.
 *
 * A small inverted-index-free scorer is enough for a corpus of a few thousand
 * words and avoids pulling in a full-text search dependency.
 *
 * Scoring runs over the index records, which every page already has. The
 * deeper prose — definitions, collocations, grammar patterns, synonyms — lives
 * in a separate file that is only downloaded once a learner actually searches;
 * pass it as `deepText` when it has arrived. Until then a query still matches
 * headwords, glosses and tags, so typing is never blocked on a download.
 */

export interface SearchHit {
  summary: VocabularySummary;
  score: number;
}

const FIELD_WEIGHTS = {
  lemmaExact: 100,
  lemmaPrefix: 60,
  lemmaContains: 40,
  meaningZh: 20,
  tag: 12,
  /** Definitions, collocations, grammar patterns, synonyms, word families. */
  deepText: 10,
} as const;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Lower-cased index fields, cached per summary object. */
interface SummaryHaystack {
  lemma: string;
  meaningZh: string;
  tags: string;
}
const haystackCache = new WeakMap<VocabularySummary, SummaryHaystack>();

function haystack(summary: VocabularySummary): SummaryHaystack {
  const cached = haystackCache.get(summary);
  if (cached) return cached;
  const built: SummaryHaystack = {
    lemma: normalize(summary.lemma),
    meaningZh: summary.meaningZh.toLowerCase(),
    tags: summary.tags.join(' ').toLowerCase(),
  };
  haystackCache.set(summary, built);
  return built;
}

function scoreSummary(
  summary: VocabularySummary,
  query: string,
  deepText: Map<string, string> | undefined,
): number {
  const hay = haystack(summary);
  let score = 0;

  if (hay.lemma === query) {
    score += FIELD_WEIGHTS.lemmaExact;
  } else if (hay.lemma.startsWith(query)) {
    score += FIELD_WEIGHTS.lemmaPrefix;
  } else if (hay.lemma.includes(query)) {
    score += FIELD_WEIGHTS.lemmaContains;
  }

  if (hay.meaningZh.includes(query)) score += FIELD_WEIGHTS.meaningZh;
  if (hay.tags.includes(query)) score += FIELD_WEIGHTS.tag;
  if (deepText?.get(summary.id)?.includes(query)) score += FIELD_WEIGHTS.deepText;

  return score;
}

/**
 * Ranked search. An empty query returns an empty result set so that callers can
 * distinguish "no query" from "no matches".
 */
export function searchVocabulary(
  summaries: VocabularySummary[],
  rawQuery: string,
  deepText?: Map<string, string>,
): SearchHit[] {
  const query = normalize(rawQuery);
  if (!query) return [];

  const hits: SearchHit[] = [];
  for (const summary of summaries) {
    const score = scoreSummary(summary, query, deepText);
    if (score > 0) hits.push({ summary, score });
  }

  return hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.summary.lemma.localeCompare(b.summary.lemma);
  });
}
