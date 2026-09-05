#!/usr/bin/env tsx
/**
 * Build-time validation of the static content.
 *
 * Runs in Node (not Vite), so it reads the JSON files straight from disk rather
 * than via `import.meta.glob`. Exits non-zero on the first problem so CI and
 * `npm run verify` fail loudly.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { quizQuestionSchema, type QuizQuestion } from '../src/domain/quiz';
import { vocabularyEntrySchema, type VocabularyEntry } from '../src/domain/vocabulary';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VOCAB_DIR = join(ROOT, 'src/data/vocabulary');
const QUESTION_DIR = join(ROOT, 'src/data/questions');

interface Problem {
  file: string;
  entry: string;
  field: string;
  reason: string;
}

const problems: Problem[] = [];

function report(file: string, entry: string, field: string, reason: string): void {
  problems.push({ file: relative(ROOT, file), entry, field, reason });
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

function readArray(file: string): unknown[] {
  const text = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    report(file, '-', 'file', `not valid JSON: ${(error as Error).message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    report(file, '-', 'file', 'must contain a top-level JSON array');
    return [];
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const entries: { entry: VocabularyEntry; file: string }[] = [];
const seenWordIds = new Map<string, string>();
const seenSlugs = new Map<string, string>();
const seenSenseIds = new Map<string, string>();

for (const file of listJsonFiles(VOCAB_DIR)) {
  for (const [index, raw] of readArray(file).entries()) {
    const result = vocabularyEntrySchema.safeParse(raw);
    const label =
      typeof raw === 'object' && raw !== null && 'lemma' in raw
        ? String((raw as { lemma: unknown }).lemma)
        : `#${index}`;

    if (!result.success) {
      for (const issue of result.error.issues) {
        report(file, label, issue.path.join('.') || '(root)', issue.message);
      }
      continue;
    }

    const entry = result.data;

    const idOwner = seenWordIds.get(entry.id);
    if (idOwner) report(file, entry.lemma, 'id', `duplicate id, already used in ${idOwner}`);
    else seenWordIds.set(entry.id, relative(ROOT, file));

    const slugOwner = seenSlugs.get(entry.slug);
    if (slugOwner) report(file, entry.lemma, 'slug', `duplicate slug, already used in ${slugOwner}`);
    else seenSlugs.set(entry.slug, relative(ROOT, file));

    for (const sense of entry.senses) {
      const senseOwner = seenSenseIds.get(sense.id);
      if (senseOwner) {
        report(file, entry.lemma, `senses.${sense.id}`, `duplicate sense id (also in ${senseOwner})`);
      } else {
        seenSenseIds.set(sense.id, `${relative(ROOT, file)}:${entry.lemma}`);
      }

      for (const example of sense.examples) {
        if (example.highlight && !example.en.includes(example.highlight)) {
          report(
            file,
            entry.lemma,
            `senses.${sense.id}.examples.highlight`,
            `highlight "${example.highlight}" does not occur in the English sentence`,
          );
        }
      }

      for (const collocation of sense.collocations ?? []) {
        const example = collocation.example;
        if (example?.highlight && !example.en.includes(example.highlight)) {
          report(
            file,
            entry.lemma,
            `senses.${sense.id}.collocations."${collocation.text}"`,
            `highlight "${example.highlight}" does not occur in the example`,
          );
        }
      }
    }

    // The KK field must actually look like a transcription.
    if (!/\//.test(entry.pronunciation.kk)) {
      report(file, entry.lemma, 'pronunciation.kk', 'KK transcription must be wrapped in slashes');
    }

    entries.push({ entry, file });
  }
}

// Cross-references can only be checked once every entry has been collected.
for (const { entry, file } of entries) {
  const links: { field: string; wordId?: string }[] = [
    ...(entry.synonyms ?? []).map((item, i) => ({
      field: `synonyms[${i}]`,
      ...(item.wordId ? { wordId: item.wordId } : {}),
    })),
    ...(entry.antonyms ?? []).map((item, i) => ({
      field: `antonyms[${i}]`,
      ...(item.wordId ? { wordId: item.wordId } : {}),
    })),
    ...(entry.commonlyConfusedWith ?? []).map((item, i) => ({
      field: `commonlyConfusedWith[${i}]`,
      ...(item.wordId ? { wordId: item.wordId } : {}),
    })),
  ];

  for (const link of links) {
    if (link.wordId && !seenWordIds.has(link.wordId)) {
      report(file, entry.lemma, link.field, `links to unknown word id "${link.wordId}"`);
    }
    if (link.wordId === entry.id) {
      report(file, entry.lemma, link.field, 'entry links to itself');
    }
  }
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questions: QuizQuestion[] = [];
const seenQuestionIds = new Map<string, string>();

for (const file of listJsonFiles(QUESTION_DIR)) {
  for (const [index, raw] of readArray(file).entries()) {
    const result = quizQuestionSchema.safeParse(raw);
    const label =
      typeof raw === 'object' && raw !== null && 'id' in raw
        ? String((raw as { id: unknown }).id)
        : `#${index}`;

    if (!result.success) {
      for (const issue of result.error.issues) {
        report(file, label, issue.path.join('.') || '(root)', issue.message);
      }
      continue;
    }

    const question = result.data;

    const owner = seenQuestionIds.get(question.id);
    if (owner) report(file, question.id, 'id', `duplicate question id, already used in ${owner}`);
    else seenQuestionIds.set(question.id, relative(ROOT, file));

    for (const wordId of question.wordIds) {
      if (!seenWordIds.has(wordId)) {
        report(file, question.id, 'wordIds', `references unknown word id "${wordId}"`);
      }
    }

    // The correct option must not be trivially identifiable by length.
    const lengths = question.options.map((option) => option.text.length);
    const correctLength =
      question.options.find((option) => option.id === question.correctOptionId)?.text.length ?? 0;
    const maxOther = Math.max(...lengths.filter((length) => length !== correctLength), 0);
    if (correctLength > 0 && maxOther > 0 && correctLength > maxOther * 3) {
      report(
        file,
        question.id,
        'options',
        'the correct option is more than 3x longer than every distractor, which gives the answer away',
      );
    }

    questions.push(question);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`\n✗ Content validation failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(`  ${problem.file}`);
    console.error(`    entry : ${problem.entry}`);
    console.error(`    field : ${problem.field}`);
    console.error(`    reason: ${problem.reason}\n`);
  }
  process.exit(1);
}

const byLevel = entries.reduce<Record<string, number>>((acc, { entry }) => {
  acc[entry.cefr] = (acc[entry.cefr] ?? 0) + 1;
  return acc;
}, {});

const byType = questions.reduce<Record<string, number>>((acc, question) => {
  acc[question.type] = (acc[question.type] ?? 0) + 1;
  return acc;
}, {});

console.log('✓ Content validation passed');
console.log(`  vocabulary entries : ${entries.length}`);
for (const [level, count] of Object.entries(byLevel).sort()) {
  console.log(`      ${level.padEnd(4)} ${count}`);
}
console.log(`  curated questions  : ${questions.length}`);
for (const [type, count] of Object.entries(byType).sort()) {
  console.log(`      ${type.padEnd(18)} ${count}`);
}
