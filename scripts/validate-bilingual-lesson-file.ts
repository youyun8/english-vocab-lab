#!/usr/bin/env tsx
/**
 * Dry-run validator for a single bilingual lesson TSV file.
 *
 * Parallel contributors each own one file under
 * `scripts/data/bilingual-lessons/` and should run this script against just
 * their own file while drafting rows. It never writes to the corpus, so
 * multiple contributors can run it at the same time without racing each
 * other or `npm run edit:bilingual`.
 *
 *   npx tsx scripts/validate-bilingual-lesson-file.ts scripts/data/bilingual-lessons/<file>.tsv
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vocabularyEntrySchema, vocabularySenseSchema, type VocabularyEntry } from '../src/domain/vocabulary';

const HEADER = 'lemma\tsense\tpos\tdefinitionEn\tdefinitionZh\tusageExplanationZh\texampleEn\texampleZh';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npx tsx scripts/validate-bilingual-lesson-file.ts <path-to-tsv>');
  process.exit(2);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VOCAB_DIR = join(ROOT, 'src/data/vocabulary');

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.json')) out.push(join(dir, name));
  }
  return out;
}

// Load the corpus once so rows can be checked against real entries: the
// lemma must exist, must be a dictionary entry (not a curated lesson), and
// every referenced part of speech must match one of that entry's own senses
// so a mistaken suffix or POS cannot silently attach to the wrong meaning.
const dictionaryEntries = new Map<string, VocabularyEntry>();
for (const file of listJsonFiles(join(VOCAB_DIR, 'exam'))) {
  const parsed = vocabularyEntrySchema.array().parse(JSON.parse(readFileSync(file, 'utf8')));
  for (const entry of parsed) dictionaryEntries.set(entry.lemma, entry);
}

const text = readFileSync(target, 'utf8');
const [header, ...rows] = text.trimEnd().split('\n');
const problems: string[] = [];

const hasCollocations = header === `${HEADER}\tcollocations`;
if (header !== HEADER && !hasCollocations) {
  problems.push(`header must be ${HEADER}, optionally followed by a collocations column`);
}

const seenSenseIds = new Set<string>();
const seenLemmas = new Set<string>();
let checked = 0;

for (const [index, row] of rows.entries()) {
  const line = index + 2;
  const columns = row.split('\t');
  const expectedColumns = hasCollocations ? 9 : 8;
  if (columns.length !== expectedColumns) {
    problems.push(`line ${line}: expected ${expectedColumns} tab-separated columns, found ${columns.length}`);
    continue;
  }
  const [lemma, suffix, partOfSpeech, definitionEn, definitionZh, usageExplanationZh, en, zh] = columns as [
    string, string, string, string, string, string, string, string,
  ];
  if (columns.some((column) => !column.trim())) {
    problems.push(`line ${line} (${lemma || '?'}): every column must be non-empty`);
    continue;
  }

  const senseId = `s_${lemma}_${suffix}`;
  if (seenSenseIds.has(senseId)) {
    problems.push(`line ${line} (${lemma}): duplicate sense id ${senseId} within this file`);
  }
  seenSenseIds.add(senseId);
  seenLemmas.add(lemma);

  let collocations: unknown;
  if (hasCollocations) {
    try {
      collocations = JSON.parse(columns[8]!);
    } catch {
      problems.push(`line ${line} (${lemma}): collocations must be a JSON array`);
      continue;
    }
  }
  const senseResult = vocabularySenseSchema.safeParse({
    id: senseId, partOfSpeech, definitionEn, definitionZh, usageExplanationZh, examples: [{ en, zh }],
    ...(hasCollocations ? { collocations } : {}),
  });
  if (!senseResult.success) {
    problems.push(`line ${line} (${lemma}): ${senseResult.error.issues.map((issue) => issue.message).join('; ')}`);
    continue;
  }

  const entry = dictionaryEntries.get(lemma);
  if (!entry) {
    problems.push(`line ${line} (${lemma}): no such headword in src/data/vocabulary/exam (check spelling and that it is not a curated lesson)`);
    continue;
  }
  if (!entry.senses.some((sense) => sense.partOfSpeech === partOfSpeech)) {
    const available = entry.senses.map((sense) => sense.partOfSpeech).join(', ');
    problems.push(`line ${line} (${lemma}): part of speech "${partOfSpeech}" does not match any original sense (${available})`);
  }

  checked += 1;
}

if (problems.length > 0) {
  console.error(`\n✗ ${basename(target)}: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`✓ ${basename(target)}: ${checked} rows, ${seenLemmas.size} headwords, all valid`);
