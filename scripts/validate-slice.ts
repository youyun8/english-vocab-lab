#!/usr/bin/env tsx
/**
 * Dry-run validator for one alphabetical slice of the sense-attribute and
 * word-family sidecars.
 *
 *   npx tsx scripts/validate-slice.ts 03
 *
 * Parallel contributors each own one slice (see `scripts/data/slice-manifest.json`)
 * and run this against their own files while drafting. It never writes to the
 * corpus, and it reads no sidecar outside the slice — only the lesson rows,
 * which say which senses exist — so it still reports on your slice while
 * everybody else's is half-finished.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { partOfSpeechSchema } from '../src/domain/vocabulary';
import { loadLessonSenseKeys } from './lib/bilingual-lessons';
import { SENSE_ATTRIBUTE_HEADER, parseSenseAttributeRow } from './lib/sense-attributes';
import { WORD_FAMILY_HEADER } from './lib/word-families';

const slice = process.argv[2]?.padStart(2, '0');
if (!slice) {
  console.error('Usage: npx tsx scripts/validate-slice.ts <slice, e.g. 03>');
  process.exit(2);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(ROOT, 'scripts/data/slice-manifest.json'), 'utf8'),
) as { slices: Record<string, string[]> };

const lemmas = manifest.slices[slice];
if (!lemmas) {
  console.error(`Unknown slice "${slice}". Known: ${Object.keys(manifest.slices).join(', ')}`);
  process.exit(2);
}

const owned = new Set(lemmas);
const problems: string[] = [];

// The lessons are the authority on which senses exist: a sense attribute row
// that names a sense nobody authored would silently never be applied. Read the
// keys only — building the full senses would demand a sidecar row for every
// lemma in the corpus, which is the very thing this run is checking for.
const authoredSenses = loadLessonSenseKeys();
const expectedSenses = new Set(
  [...authoredSenses].filter((key) => owned.has(key.slice(0, key.indexOf('\t')))),
);

function readRows(path: string, header: string, label: string): string[][] | null {
  let text: string;
  try {
    text = readFileSync(join(ROOT, path), 'utf8');
  } catch {
    problems.push(`${label}: ${path} does not exist yet`);
    return null;
  }
  const [found, ...rows] = text.trimEnd().split('\n');
  if (found !== header) {
    problems.push(`${label}: header must be exactly "${header.replace(/\t/g, '\\t')}"`);
    return null;
  }
  return rows.map((row) => row.split('\t'));
}

// ---------------------------------------------------------------------------
// Sense attributes
// ---------------------------------------------------------------------------

const attributePath = `scripts/data/sense-attributes/slice${slice}.tsv`;
const attributeRows = readRows(attributePath, SENSE_ATTRIBUTE_HEADER, 'sense attributes');
const seenSenses = new Set<string>();

for (const [index, columns] of (attributeRows ?? []).entries()) {
  const line = index + 2;
  const key = `${columns[0] ?? ''}\t${columns[1] ?? ''}`;
  const label = key.replace('\t', '/');

  if (!owned.has(columns[0] ?? '')) {
    problems.push(`sense attributes line ${line}: "${columns[0]}" is not in slice ${slice}`);
    continue;
  }
  if (!expectedSenses.has(key)) {
    problems.push(`sense attributes line ${line}: no authored bilingual sense "${label}"`);
    continue;
  }
  if (seenSenses.has(key)) {
    problems.push(`sense attributes line ${line}: duplicate row for "${label}"`);
    continue;
  }
  seenSenses.add(key);

  try {
    parseSenseAttributeRow(columns);
  } catch (error) {
    problems.push(`sense attributes line ${line} (${label}): ${(error as Error).message}`);
  }
}

if (attributeRows) {
  for (const key of expectedSenses) {
    if (!seenSenses.has(key)) {
      problems.push(`sense attributes: missing row for "${key.replace('\t', '/')}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Word families
// ---------------------------------------------------------------------------

const familyPath = `scripts/data/word-families/slice${slice}.tsv`;
const familyRows = readRows(familyPath, WORD_FAMILY_HEADER, 'word families');
const familyMembers = new Map<string, Set<string>>();

for (const [index, columns] of (familyRows ?? []).entries()) {
  const line = index + 2;
  if (columns.length !== 4) {
    problems.push(`word families line ${line}: expected 4 columns, found ${columns.length}`);
    continue;
  }
  const [lemma, familyLemma, pos, meaningZh] = columns as [string, string, string, string];

  if (!owned.has(lemma)) {
    problems.push(`word families line ${line}: "${lemma}" is not in slice ${slice}`);
    continue;
  }
  if (columns.some((column) => !column.trim())) {
    problems.push(`word families line ${line} (${lemma}): every column must be non-empty`);
    continue;
  }
  if (!partOfSpeechSchema.safeParse(pos).success) {
    problems.push(`word families line ${line} (${lemma}): unknown part of speech "${pos}"`);
  }
  if (familyLemma === lemma) {
    problems.push(`word families line ${line} (${lemma}): a word is not its own family member`);
  }
  if (!/[㐀-鿿]/.test(meaningZh)) {
    problems.push(`word families line ${line} (${lemma}): meaningZh must be Traditional Chinese`);
  }

  const members = familyMembers.get(lemma) ?? new Set();
  if (members.has(familyLemma)) {
    problems.push(`word families line ${line} (${lemma}): duplicate member "${familyLemma}"`);
  }
  members.add(familyLemma);
  familyMembers.set(lemma, members);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const MAX_SHOWN = 40;
if (problems.length > 0) {
  console.error(`\n✗ slice ${slice}: ${problems.length} problem(s)\n`);
  for (const problem of problems.slice(0, MAX_SHOWN)) console.error(`  ${problem}`);
  if (problems.length > MAX_SHOWN) console.error(`  … and ${problems.length - MAX_SHOWN} more`);
  process.exit(1);
}

const covered = familyMembers.size;
console.log(`✓ slice ${slice}`);
console.log(`  sense attributes : ${seenSenses.size}/${expectedSenses.size} senses`);
console.log(`  word families    : ${covered}/${lemmas.length} headwords, ${familyRows?.length ?? 0} members`);
