#!/usr/bin/env tsx
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { draftVocabularyEntrySchema, vocabularyEntrySchema } from '../src/domain/vocabulary';
import { applyBilingualLesson, loadBilingualLessons, loadWordFamilies } from './lib/bilingual-lessons';

const directory = new URL('../src/data/vocabulary/exam/', import.meta.url);
const lessons = loadBilingualLessons();
const families = loadWordFamilies();
const pending = new Set(lessons.keys());
const pendingFamilies = new Set(families.keys());
const writes: { file: URL; text: string }[] = [];
for (const filename of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
  const file = new URL(filename, directory);
  const rows = JSON.parse(readFileSync(file, 'utf8')) as unknown[];
  let changed = false;
  const updated = rows.map((row) => {
    // Read as drafts and write as finished entries: applying the lesson is what
    // supplies the register and grammar patterns the strict schema insists on,
    // so this script has to be able to run over a chunk that lacks them.
    const entry = draftVocabularyEntrySchema.parse(row);
    // Hand back the original object for entries this run does not rewrite. The
    // draft schema strips `register` and `grammarPatterns`, so re-serialising a
    // parsed-but-untouched entry would silently delete authored fields.
    if (!lessons.has(entry.lemma)) return row;
    pending.delete(entry.lemma);
    pendingFamilies.delete(entry.lemma);
    changed = true;
    return vocabularyEntrySchema.parse(applyBilingualLesson(entry, lessons, families));
  });
  if (changed) writes.push({ file, text: `${JSON.stringify(updated, null, 2)}\n` });
}
if (pending.size) throw new Error(`Unknown lesson headwords: ${[...pending].join(', ')}`);
// Families are applied through the same path as lessons, so a headword the
// corpus never reaches would be dropped without a word rather than reported.
if (pendingFamilies.size) {
  throw new Error(`Unknown word-family headwords: ${[...pendingFamilies].join(', ')}`);
}
// Validate all rows and entries before changing any chunk.
for (const { file, text } of writes) writeFileSync(file, text);
console.log(`Applied ${lessons.size} bilingual lessons. Run npm run build:index next.`);
