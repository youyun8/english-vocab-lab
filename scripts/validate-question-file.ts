#!/usr/bin/env tsx
/**
 * Dry-run validator for a single curated question file.
 *
 * Parallel contributors each own a few files under `src/data/questions/` and
 * run this against their own while drafting. Unlike `npm run validate:data` it
 * reads no other question file, so it stays green while those are mid-edit. It
 * does read the vocabulary corpus, which the `wordIds` cross-check needs.
 *
 *   npx tsx scripts/validate-question-file.ts src/data/questions/cloze.json
 *
 * Beyond the schema it enforces the properties that keep an item exam-worthy:
 * every distractor is explained, the answer is not the odd one out by length,
 * and the difficulty rating is not the giveaway-easy end of the scale.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { quizQuestionSchema } from '../src/domain/quiz';
import { vocabularyEntrySchema } from '../src/domain/vocabulary';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: npx tsx scripts/validate-question-file.ts <path-to-json> [...]');
  process.exit(2);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VOCAB_DIR = join(ROOT, 'src/data/vocabulary');

const wordIds = new Set<string>();
const walk = (dir: string) => {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else if (name.name.endsWith('.json')) {
      for (const entry of vocabularyEntrySchema.array().parse(JSON.parse(readFileSync(full, 'utf8')))) {
        wordIds.add(entry.id);
      }
    }
  }
};
walk(VOCAB_DIR);

/** Simplified-only characters that must never reach a Traditional Chinese UI. */
const SIMPLIFIED_ONLY = /[习实这个们说会电脑单词题样对错还应该没关键为强难义务权价]/;

const problems: string[] = [];
let checked = 0;
const difficulties: number[] = [];

for (const target of targets) {
  const file = basename(target);
  const raw: unknown = JSON.parse(readFileSync(target, 'utf8'));
  if (!Array.isArray(raw)) {
    problems.push(`${file}: must contain a top-level JSON array`);
    continue;
  }

  const seen = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const parsed = quizQuestionSchema.safeParse(item);
    const label = `${file} #${index + 1}`;
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${label}: ${issue.path.join('.') || '(root)'} — ${issue.message}`);
      }
      continue;
    }
    const question = parsed.data;
    const at = `${file} ${question.id}`;

    if (seen.has(question.id)) problems.push(`${at}: duplicate id within the file`);
    seen.add(question.id);

    for (const id of question.wordIds) {
      if (!wordIds.has(id)) problems.push(`${at}: wordIds references unknown entry "${id}"`);
    }

    // Every distractor carries a reason, so feedback explains the whole item
    // rather than only the key.
    const distractors = question.options.filter((option) => option.id !== question.correctOptionId);
    for (const distractor of distractors) {
      if (!question.distractorExplanations?.[distractor.id]?.trim()) {
        problems.push(`${at}: option "${distractor.id}" has no distractorExplanations entry`);
      }
    }

    const correct = question.options.find((option) => option.id === question.correctOptionId);
    const longestOther = Math.max(...distractors.map((option) => option.text.length));
    if (correct && correct.text.length > longestOther * 3) {
      problems.push(`${at}: the answer is more than 3x longer than every distractor`);
    }

    if (question.difficulty < 3) {
      problems.push(`${at}: difficulty ${question.difficulty} is below the exam floor of 3`);
    }

    const prose = [question.explanation, ...Object.values(question.distractorExplanations ?? {})].join('');
    if (SIMPLIFIED_ONLY.test(prose)) {
      problems.push(`${at}: explanation contains Simplified Chinese characters`);
    }
    if (question.explanation.trim().length <= 10) {
      problems.push(`${at}: explanation is too short to teach anything`);
    }

    difficulties.push(question.difficulty);
    checked += 1;
  }
}

const MAX_SHOWN = 40;
if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} problem(s)\n`);
  for (const problem of problems.slice(0, MAX_SHOWN)) console.error(`  ${problem}`);
  if (problems.length > MAX_SHOWN) console.error(`  … and ${problems.length - MAX_SHOWN} more`);
  process.exit(1);
}

const mean = difficulties.reduce((sum, value) => sum + value, 0) / (difficulties.length || 1);
console.log(`✓ ${checked} question(s) valid; mean difficulty ${mean.toFixed(2)}`);
