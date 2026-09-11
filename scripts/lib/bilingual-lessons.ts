import { readFileSync, readdirSync } from 'node:fs';
import { vocabularySenseSchema, type VocabularyEntry, type VocabularySense } from '../../src/domain/vocabulary';

const HEADER = 'lemma\tsense\tpos\tdefinitionEn\tdefinitionZh\tusageExplanationZh\texampleEn\texampleZh';

/**
 * Authored rows, one bilingual meaning and contextual example per row.
 *
 * Rows are split across several files in `scripts/data/bilingual-lessons/` so
 * multiple contributors (including parallel agents) can each own a file and
 * append to it without touching the same lines as anyone else. Every file
 * must use the same header and every lemma must be unique across all files.
 * Files may append a `collocations` column containing a JSON array of common
 * usages and phrases, so applying lessons preserves the authored phrases.
 */
export function loadBilingualLessons(): Map<string, VocabularySense[]> {
  const dir = new URL('../data/bilingual-lessons/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.tsv')).sort();
  if (files.length === 0) throw new Error('No bilingual lesson files found');

  const lessons = new Map<string, VocabularySense[]>();
  const lemmaOwner = new Map<string, string>();

  for (const filename of files) {
    const text = readFileSync(new URL(filename, dir), 'utf8');
    const [header, ...rows] = text.trimEnd().split('\n');
    const hasCollocations = header === `${HEADER}\tcollocations`;
    if (header !== HEADER && !hasCollocations) {
      throw new Error(`Unexpected bilingual lesson columns in ${filename}`);
    }
    for (const [index, row] of rows.entries()) {
      const columns = row.split('\t');
      if (columns.length !== (hasCollocations ? 9 : 8) || columns.some((column) => !column.trim())) {
        throw new Error(`Invalid bilingual lesson row ${index + 2} in ${filename}`);
      }
      const [lemma, suffix, partOfSpeech, definitionEn, definitionZh, usageExplanationZh, en, zh] = columns as [string, string, string, string, string, string, string, string];
      const owner = lemmaOwner.get(lemma);
      if (owner && owner !== filename) {
        throw new Error(`Lemma "${lemma}" is authored in both ${owner} and ${filename}`);
      }
      lemmaOwner.set(lemma, filename);
      const sense = vocabularySenseSchema.parse({
        id: `s_${lemma}_${suffix}`, partOfSpeech, definitionEn, definitionZh,
        usageExplanationZh, examples: [{ en, zh }],
        ...(hasCollocations ? { collocations: JSON.parse(columns[8]!) } : {}),
      });
      const senses = lessons.get(lemma) ?? [];
      if (senses.some((existing) => existing.id === sense.id)) {
        throw new Error(`Duplicate bilingual sense: ${sense.id}`);
      }
      senses.push(sense);
      lessons.set(lemma, senses);
    }
  }
  return lessons;
}

export function applyBilingualLesson(entry: VocabularyEntry, lessons: Map<string, VocabularySense[]>): VocabularyEntry {
  const senses = lessons.get(entry.lemma);
  return senses ? { ...entry, senses, contentRevision: 'bilingual-v1' } : entry;
}
