import { readFileSync, readdirSync } from 'node:fs';
import {
  collocationSchema,
  vocabularySenseSchema,
  type Collocation,
  type DraftVocabularyEntry,
  type VocabularySense,
  type WordFamilyItem,
} from '../../src/domain/vocabulary';
import { loadSenseAttributes, senseAttributeKey } from './sense-attributes';
import { loadWordFamilies } from './word-families';

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
 *
 * `register` and `grammarPatterns` are merged in from the sense-attribute
 * sidecars (see `./sense-attributes`), which are keyed by lemma and sense
 * suffix rather than added as further columns here — the lesson rows predate
 * those fields and rewriting all of them would risk the prose already in them.
 */
/**
 * Every other failure in a lesson file names the file and line; a malformed
 * collocations cell used to throw a bare `SyntaxError` with no way to tell
 * which of thousands of rows produced it.
 */
function parseCollocations(cell: string, filename: string, line: number): Collocation[] {
  const where = `${filename} line ${line}: collocations`;
  let value: unknown;
  try {
    value = JSON.parse(cell);
  } catch (error) {
    throw new Error(`${where} is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  const parsed = collocationSchema.array().safeParse(value);
  if (!parsed.success) {
    throw new Error(`${where} is not an array of collocations: ${parsed.error.message}`);
  }
  return parsed.data;
}

interface LessonRow {
  filename: string;
  line: number;
  columns: string[];
  hasCollocations: boolean;
}

/** Reads and shape-checks every lesson row, without consulting the sidecars. */
function* readLessonRows(): Generator<LessonRow> {
  const dir = new URL('../data/bilingual-lessons/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.tsv')).sort();
  if (files.length === 0) throw new Error('No bilingual lesson files found');

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
      yield { filename, line: index + 2, columns, hasCollocations };
    }
  }
}

/**
 * Every authored sense, keyed by `senseAttributeKey`, read from the lesson
 * files alone.
 *
 * `loadBilingualLessons` refuses to return until every one of these has a
 * sidecar row — which is precisely the state a contributor is working towards.
 * Tools that only need to know which senses exist use this instead, so they
 * never fail on a file somebody else is still drafting.
 */
export function loadLessonSenseKeys(): Set<string> {
  const keys = new Set<string>();
  for (const { filename, line, columns } of readLessonRows()) {
    const key = senseAttributeKey(columns[0]!, columns[1]!);
    if (keys.has(key)) {
      throw new Error(`${filename} line ${line}: duplicate sense "${key.replace('\t', '/')}"`);
    }
    keys.add(key);
  }
  return keys;
}

export function loadBilingualLessons(): Map<string, VocabularySense[]> {
  const attributes = loadSenseAttributes();
  const lessons = new Map<string, VocabularySense[]>();
  const lemmaOwner = new Map<string, string>();

  for (const { filename, line, columns, hasCollocations } of readLessonRows()) {
    const [lemma, suffix, partOfSpeech, definitionEn, definitionZh, usageExplanationZh, en, zh] = columns as [string, string, string, string, string, string, string, string];
    const owner = lemmaOwner.get(lemma);
    if (owner && owner !== filename) {
      throw new Error(`Lemma "${lemma}" is authored in both ${owner} and ${filename}`);
    }
    lemmaOwner.set(lemma, filename);
    // Every lesson row needs its sidecar row: a sense with no register and no
    // grammar pattern cannot be laid out to the word-page spec, so it is
    // better to name the missing key here than to ship a half-built page.
    const extra = attributes.get(senseAttributeKey(lemma, suffix));
    if (!extra) {
      throw new Error(`${filename} line ${line}: no sense attributes authored for "${lemma}/${suffix}"`);
    }
    // Key order here is the shipped JSON's key order, so it follows the
    // canonical field order in `scripts/merge-vocabulary-fields.ts`.
    const sense = vocabularySenseSchema.parse({
      id: `s_${lemma}_${suffix}`, partOfSpeech,
      register: extra.register,
      definitionEn, definitionZh, usageExplanationZh,
      grammarPatterns: extra.grammarPatterns,
      ...(hasCollocations ? { collocations: parseCollocations(columns[8]!, filename, line) } : {}),
      examples: [{ en, zh }],
    });
    const senses = lessons.get(lemma) ?? [];
    if (senses.some((existing) => existing.id === sense.id)) {
      throw new Error(`Duplicate bilingual sense: ${sense.id}`);
    }
    senses.push(sense);
    lessons.set(lemma, senses);
  }
  return lessons;
}

/**
 * Takes a draft because the import script calls this on entries that have not
 * been authored yet; a lesson is exactly what completes them. The result is
 * still typed as a draft — callers run it through `vocabularyEntrySchema` to
 * prove an entry really is finished before writing it to a chunk file.
 */
export function applyBilingualLesson(
  entry: DraftVocabularyEntry,
  lessons: Map<string, VocabularySense[]>,
  families: Map<string, WordFamilyItem[]>,
): DraftVocabularyEntry {
  const senses = lessons.get(entry.lemma);
  if (!senses) return entry;
  const next: DraftVocabularyEntry = { ...entry, senses, contentRevision: 'bilingual-v1' };
  // The sidecar is authoritative rather than additive: deleting a row there has
  // to remove the family from the chunk, otherwise a family nobody can still
  // find in `scripts/data/word-families/` stays in the shipped JSON forever.
  // Assigning and deleting in place keeps the canonical key order intact.
  const wordFamily = families.get(entry.lemma);
  if (wordFamily?.length) next.wordFamily = wordFamily;
  else delete next.wordFamily;
  return next;
}

export { loadWordFamilies };
