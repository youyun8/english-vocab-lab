#!/usr/bin/env tsx
/**
 * Merges additional fields into existing vocabulary entries from a patch file.
 *
 *   npm run merge:vocab -- patch.json
 *
 * The patch is an object keyed by entry id; each value holds the fields to add.
 * Entry-level fields (`synonyms`, `antonyms`, `commonlyConfusedWith`, …) attach
 * to the entry; sense-level fields (`usageNotes`) attach to the first sense, or
 * to the sense named by an accompanying `senseId`.
 *
 * The script refuses to overwrite anything that already exists and exits
 * non-zero if it had to skip something, so it can be re-run safely and cannot
 * silently clobber curated content.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Sense {
  id: string;
  usageNotes?: unknown;
  [key: string]: unknown;
}

interface Entry {
  id: string;
  senses: Sense[];
  [key: string]: unknown;
}

type Patch = Record<string, Record<string, unknown> & { senseId?: string }>;

// Keep a stable key order so the JSON stays readable and diffs stay small.
// These also enumerate the fields a patch may target: anything else is a typo
// or a field the domain has since dropped, and writing it would leave junk in
// the chunk that the schemas quietly strip on load.
const ENTRY_ORDER = [
  'id', 'lemma', 'slug', 'cefr', 'pronunciation', 'forms', 'senses',
  'synonyms', 'antonyms', 'commonlyConfusedWith', 'wordFamily', 'tags',
];
const SENSE_ORDER = [
  'id', 'partOfSpeech', 'register', 'definitionEn', 'definitionZh',
  'usageExplanationZh', 'grammarPatterns', 'collocations', 'examples',
  'usageNotes',
];

const VOCAB = 'src/data/vocabulary';
const patchPath = process.argv[2];
if (!patchPath) {
  console.error('usage: npm run merge:vocab -- <patch.json>');
  process.exit(2);
}
const patch = JSON.parse(readFileSync(patchPath, 'utf8')) as Patch;

const files: string[] = [];
for (const level of readdirSync(VOCAB)) {
  for (const name of readdirSync(join(VOCAB, level))) {
    files.push(join(VOCAB, level, name));
  }
}

const index = new Map<string, { file: string; entry: Entry }>();
const contents = new Map<string, Entry[]>();
for (const file of files) {
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Entry[];
  contents.set(file, entries);
  for (const entry of entries) index.set(entry.id, { file, entry });
}

const touched = new Set<string>();
let added = 0;
const problems: string[] = [];

for (const [id, fields] of Object.entries(patch)) {
  const found = index.get(id);
  if (!found) {
    problems.push(`${id}: no such entry`);
    continue;
  }
  const { file, entry } = found;

  for (const [field, value] of Object.entries(fields)) {
    if (field === 'senseId') continue;
    if (field !== 'usageNotes' && !ENTRY_ORDER.includes(field)) {
      problems.push(`${id}: unknown field "${field}"`);
      continue;
    }

    if (field === 'usageNotes') {
      // Sense-level fields attach to the first sense unless a senseId is given.
      const { senseId } = fields;
      const sense = senseId
        ? entry.senses.find((candidate) => candidate.id === senseId)
        : entry.senses[0];
      if (!sense) {
        problems.push(`${id}: no sense to attach ${field} to`);
        continue;
      }
      if (sense[field]) {
        problems.push(`${id}: ${field} already present on ${sense.id} — refusing to overwrite`);
        continue;
      }
      sense[field] = value;
      added += 1;
      touched.add(file);
      continue;
    }

    if (entry[field]) {
      problems.push(`${id}: ${field} already present — refusing to overwrite`);
      continue;
    }
    entry[field] = value;
    added += 1;
    touched.add(file);
  }
}

function reorder<T extends Record<string, unknown>>(object: T, order: string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of order) if (key in object) out[key] = object[key];
  for (const key of Object.keys(object)) if (!(key in out)) out[key] = object[key];
  return out as T;
}

for (const file of touched) {
  const entries = (contents.get(file) ?? []).map((entry) => {
    const next = reorder(entry, ENTRY_ORDER);
    next.senses = next.senses.map((sense) => reorder(sense, SENSE_ORDER));
    return next;
  });
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`);
}

console.log(`applied ${added} field(s) across ${touched.size} file(s)`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
