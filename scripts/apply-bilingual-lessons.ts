#!/usr/bin/env tsx
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { vocabularyEntrySchema } from '../src/domain/vocabulary';
import { applyBilingualLesson, loadBilingualLessons } from './lib/bilingual-lessons';

const directory = new URL('../src/data/vocabulary/exam/', import.meta.url);
const lessons = loadBilingualLessons();
const pending = new Set(lessons.keys());
const writes: { file: URL; text: string }[] = [];
for (const filename of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
  const file = new URL(filename, directory);
  const entries = vocabularyEntrySchema.array().parse(JSON.parse(readFileSync(file, 'utf8')));
  let changed = false;
  const updated = entries.map((entry) => {
    if (!lessons.has(entry.lemma)) return entry;
    pending.delete(entry.lemma);
    changed = true;
    return vocabularyEntrySchema.parse(applyBilingualLesson(entry, lessons));
  });
  if (changed) writes.push({ file, text: `${JSON.stringify(updated, null, 2)}\n` });
}
if (pending.size) throw new Error(`Unknown lesson headwords: ${[...pending].join(', ')}`);
// Validate all rows and entries before changing any chunk.
for (const { file, text } of writes) writeFileSync(file, text);
console.log(`Applied ${lessons.size} bilingual lessons. Run npm run build:index next.`);
