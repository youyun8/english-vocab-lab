#!/usr/bin/env tsx
/**
 * Verifies every KK transcription in the corpus against the CMU Pronouncing
 * Dictionary (135k entries of ARPABET, derived from real American English
 * pronunciation data).
 *
 * Exit codes:
 *   0  every transcription matches, or differs only by an accepted variant
 *   1  at least one transcription genuinely disagrees with the dictionary
 *
 * Run with `--verbose` to also list variants and unverifiable headwords.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dictionary } from 'cmu-pronouncing-dictionary';

import { compareKk, extractTranscriptions, kkFromArpabet, type ComparisonStatus } from './lib/kk';
import { KK_EXCEPTIONS, findKkException } from './lib/kk-exceptions';
import { vocabularyEntrySchema } from '../src/domain/vocabulary';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VOCAB_DIR = join(ROOT, 'src/data/vocabulary');
const verbose = process.argv.includes('--verbose');

const lookup = dictionary as Record<string, string | undefined>;

type ReportStatus = ComparisonStatus | 'unverifiable' | 'exception';

interface Report {
  file: string;
  lemma: string;
  status: ReportStatus;
  transcription: string;
  expected?: string;
  notes: string[];
}

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const reports: Report[] = [];

for (const file of listJsonFiles(VOCAB_DIR)) {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) continue;

  for (const raw of parsed) {
    const result = vocabularyEntrySchema.safeParse(raw);
    if (!result.success) continue; // structural problems are validate:data's job
    const entry = result.data;

    const arpabet = lookup[entry.lemma.toLowerCase()];
    const transcriptions = extractTranscriptions(entry.pronunciation.kk);

    if (transcriptions.length === 0) {
      reports.push({
        file: relative(ROOT, file),
        lemma: entry.lemma,
        status: 'mismatch',
        transcription: entry.pronunciation.kk,
        notes: ['no /…/ transcription found in the pronunciation field'],
      });
      continue;
    }

    if (!arpabet) {
      reports.push({
        file: relative(ROOT, file),
        lemma: entry.lemma,
        status: 'unverifiable',
        transcription: transcriptions[0] as string,
        notes: ['headword is not in the CMU Pronouncing Dictionary'],
      });
      continue;
    }

    // An entry may list several pronunciations (e.g. a verb and a noun form).
    // The dictionary holds one, so the entry passes if any of them matches it.
    let best: Report | null = null;

    for (const transcription of transcriptions) {
      const exception = findKkException(entry.lemma, transcription);
      if (exception) {
        best = {
          file: relative(ROOT, file),
          lemma: entry.lemma,
          status: 'exception',
          transcription,
          expected: kkFromArpabet(arpabet),
          notes: [exception.reason],
        };
        break;
      }

      let comparison;
      try {
        comparison = compareKk(transcription, arpabet);
      } catch (error) {
        best = {
          file: relative(ROOT, file),
          lemma: entry.lemma,
          status: 'mismatch',
          transcription,
          expected: kkFromArpabet(arpabet),
          notes: [(error as Error).message],
        };
        continue;
      }

      const report: Report = {
        file: relative(ROOT, file),
        lemma: entry.lemma,
        status: comparison.status,
        transcription,
        expected: comparison.expected,
        notes: comparison.notes,
      };

      if (comparison.status === 'match') {
        best = report;
        break;
      }
      // Prefer the least-surprising classification when an entry lists several
      // transcriptions: convention beats variant beats mismatch.
      const rank: Record<string, number> = { convention: 2, variant: 1, mismatch: 0 };
      if (!best || (rank[comparison.status] ?? 0) > (rank[best.status] ?? -1)) best = report;
    }

    if (best) reports.push(best);
  }
}

const mismatches = reports.filter((report) => report.status === 'mismatch');
const exceptions = reports.filter((report) => report.status === 'exception');
const variants = reports.filter((report) => report.status === 'variant');
const conventions = reports.filter((report) => report.status === 'convention');
const unverifiable = reports.filter((report) => report.status === 'unverifiable');
const matches = reports.filter((report) => report.status === 'match');

function print(report: Report): void {
  console.log(`  ${report.file}`);
  console.log(`    headword: ${report.lemma}`);
  console.log(`    yours   : ${report.transcription}`);
  if (report.expected) console.log(`    cmudict : ${report.expected}`);
  for (const note of report.notes) console.log(`    note    : ${note}`);
  console.log('');
}

if (mismatches.length > 0) {
  console.error(`\n✗ KK verification failed for ${mismatches.length} headword(s):\n`);
  mismatches.forEach(print);
}

if (verbose && conventions.length > 0) {
  console.log(`\nHouse convention (${conventions.length}) — ${'unstressed /i/ written /ɪ/'}:\n`);
  conventions.forEach(print);
}

if (verbose && variants.length > 0) {
  console.log(`\nAccepted variants (${variants.length}) — unstressed-vowel or secondary-stress differences:\n`);
  variants.forEach(print);
}

if (verbose && exceptions.length > 0) {
  console.log(`\nDocumented exceptions (${exceptions.length}) — see scripts/lib/kk-exceptions.ts:\n`);
  exceptions.forEach(print);
}

if (verbose && unverifiable.length > 0) {
  console.log(`\nNot in CMUdict (${unverifiable.length}) — verify these by hand:\n`);
  unverifiable.forEach(print);
}

console.log(
  [
    mismatches.length === 0 ? '✓ KK verification passed' : '✗ KK verification failed',
    `  checked      : ${reports.length}`,
    `  exact match  : ${matches.length}`,
    `  convention   : ${conventions.length}`,
    `  variant      : ${variants.length}`,
    `  exception    : ${exceptions.length} (of ${KK_EXCEPTIONS.length} declared)`,
    `  unverifiable : ${unverifiable.length}`,
    `  mismatch     : ${mismatches.length}`,
  ].join('\n'),
);

process.exit(mismatches.length > 0 ? 1 : 0);
