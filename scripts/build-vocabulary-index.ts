#!/usr/bin/env tsx
/**
 * Generates the two files the app loads instead of the whole corpus:
 *
 *  - `src/data/vocabulary-index.json` — one row per word with everything the
 *    word bank, dashboard, review, statistics and in-app links render. Every
 *    visitor downloads this once; at 4,120 words it is about a quarter of the
 *    corpus over the wire, and the full entry is fetched only for the word
 *    actually opened.
 *  - `src/data/vocabulary-search.json` — the deeper searchable prose
 *    (definitions, collocations, grammar patterns, synonyms). Fetched only when
 *    the learner actually types a query, because it is the larger half.
 *
 * Rows are positional arrays rather than objects: the key names would be a
 * third of the shipped size. The field order lives in `INDEX_FIELDS` and the
 * loader in `src/data/index.ts` reads it back through the same list.
 *
 * Run `npm run build:index` after changing vocabulary data; `npm run
 * validate:data` fails when the committed files no longer match the corpus.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  searchTextOf,
  summarize,
  vocabularyEntrySchema,
  type VocabularySummary,
} from '../src/domain/vocabulary';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VOCAB_DIR = join(ROOT, 'src/data/vocabulary');
export const INDEX_PATH = join(ROOT, 'src/data/vocabulary-index.json');
export const SEARCH_PATH = join(ROOT, 'src/data/vocabulary-search.json');

/** Field order of an index row. The loader parses rows against this list. */
export const INDEX_FIELDS = [
  'id',
  'lemma',
  'slug',
  'cefr',
  'kk',
  'partsOfSpeech',
  'meaningZh',
  'tags',
  'chunk',
  'dictionary',
] as const;

export type IndexRow = [
  string, // id
  string, // lemma
  string, // slug
  string, // cefr
  string, // kk
  string, // parts of speech, comma separated
  string, // meaningZh
  string, // tags, space separated
  string, // chunk holding the full entry
  0 | 1, // dictionary entry
];

/** `[id, searchable prose]`, keyed by id so it cannot silently misalign. */
export type SearchRow = [string, string];

export interface VocabularyIndexFile {
  fields: readonly string[];
  rows: IndexRow[];
}

export interface VocabularySearchFile {
  rows: SearchRow[];
}

function chunkFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) files.push(full);
    }
  };
  walk(VOCAB_DIR);
  return files;
}

/** Chunk id: the path under `src/data/vocabulary` without the extension. */
export function chunkIdOf(file: string): string {
  return relative(VOCAB_DIR, file).replace(/\.json$/, '');
}

function toRow(summary: VocabularySummary): IndexRow {
  return [
    summary.id,
    summary.lemma,
    summary.slug,
    summary.cefr,
    summary.kk,
    summary.partsOfSpeech.join(','),
    summary.meaningZh,
    summary.tags.join(' '),
    summary.chunk,
    summary.dictionary ? 1 : 0,
  ];
}

/** Builds both files from the vocabulary chunks on disk. */
export function buildIndex(): { index: VocabularyIndexFile; search: VocabularySearchFile } {
  const records: { summary: VocabularySummary; searchText: string }[] = [];
  for (const file of chunkFiles()) {
    const chunk = chunkIdOf(file);
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
    for (const raw of parsed) {
      const entry = vocabularyEntrySchema.parse(raw);
      records.push({ summary: summarize(entry, chunk), searchText: searchTextOf(entry) });
    }
  }
  // Alphabetical: the word bank's default order, so the common case needs no sort.
  records.sort((a, b) =>
    a.summary.lemma.localeCompare(b.summary.lemma, 'en')
    || a.summary.id.localeCompare(b.summary.id));

  return {
    index: { fields: INDEX_FIELDS, rows: records.map((record) => toRow(record.summary)) },
    search: {
      rows: records
        .filter((record) => record.searchText.length > 0)
        .map((record) => [record.summary.id, record.searchText] as SearchRow),
    },
  };
}

/** One row per line keeps the generated files reviewable in a diff. */
function serializeRows(rows: unknown[], head = ''): string {
  const body = rows.map((row) => `  ${JSON.stringify(row)}`).join(',\n');
  return `{\n${head} "rows": [\n${body}\n ]\n}\n`;
}

export function serializeIndex(index: VocabularyIndexFile): string {
  return serializeRows(index.rows, ` "fields": ${JSON.stringify(index.fields)},\n`);
}

export function serializeSearch(search: VocabularySearchFile): string {
  return serializeRows(search.rows);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { index, search } = buildIndex();
  writeFileSync(INDEX_PATH, serializeIndex(index));
  writeFileSync(SEARCH_PATH, serializeSearch(search));
  console.log(`Wrote ${index.rows.length} index rows to ${relative(ROOT, INDEX_PATH)}`);
  console.log(`Wrote ${search.rows.length} search rows to ${relative(ROOT, SEARCH_PATH)}`);
}
