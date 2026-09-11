import { readFileSync, readdirSync } from 'node:fs';

import { partOfSpeechSchema, wordFamilyItemSchema, type WordFamilyItem } from '../../src/domain/vocabulary';

/**
 * Word families authored for the imported dictionary entries.
 *
 * The curated lessons carry their word family inline in the entry JSON. The
 * imported entries get theirs from these sidecar files so the same alphabetical
 * slice that owns a word's sense attributes also owns its family, and no two
 * contributors write to one file.
 *
 * One row per family member; several rows share a `lemma`. A headword with no
 * genuine morphological relatives simply has no rows — inventing a family to
 * fill the field would teach a word that does not exist.
 */

export const WORD_FAMILY_HEADER = 'lemma\tfamilyLemma\tpos\tmeaningZh';

/** Every authored word family, keyed by headword, in file order. */
export function loadWordFamilies(): Map<string, WordFamilyItem[]> {
  const dir = new URL('../data/word-families/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.tsv')).sort();

  const families = new Map<string, WordFamilyItem[]>();
  const owner = new Map<string, string>();

  for (const filename of files) {
    const text = readFileSync(new URL(filename, dir), 'utf8');
    const [header, ...rows] = text.trimEnd().split('\n');
    if (header !== WORD_FAMILY_HEADER) {
      throw new Error(`Unexpected word-family columns in ${filename}`);
    }
    for (const [index, row] of rows.entries()) {
      const columns = row.split('\t');
      const fail = (reason: string) => new Error(`${filename} line ${index + 2}: ${reason}`);
      if (columns.length !== 4) {
        throw fail(`expected 4 tab-separated columns, found ${columns.length}`);
      }
      const [lemma, familyLemma, pos, meaningZh] = columns as [string, string, string, string];

      const previous = owner.get(lemma);
      if (previous && previous !== filename) {
        throw fail(`headword "${lemma}" is also authored in ${previous}`);
      }
      owner.set(lemma, filename);

      if (!partOfSpeechSchema.safeParse(pos).success) throw fail(`unknown part of speech "${pos}"`);
      const parsed = wordFamilyItemSchema.safeParse({ lemma: familyLemma, partOfSpeech: pos, meaningZh });
      if (!parsed.success) {
        throw fail(parsed.error.issues.map((issue) => issue.message).join('; '));
      }

      const members = families.get(lemma) ?? [];
      if (members.some((member) => member.lemma === familyLemma)) {
        throw fail(`duplicate family member "${familyLemma}" for "${lemma}"`);
      }
      members.push(parsed.data);
      families.set(lemma, members);
    }
  }

  return families;
}
