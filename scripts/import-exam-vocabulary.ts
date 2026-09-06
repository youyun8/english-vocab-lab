#!/usr/bin/env tsx
/** Deterministic, offline import. Download the pinned CSV described in docs/corpus.md first. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { vocabularyEntrySchema, type VocabularyEntry, type VocabularySense } from '../src/domain/vocabulary';
import { dictionaryEntry, ECDICT_SHA256, frequencyRank, type DictionaryRow } from './lib/ecdict';
import { kkFromArpabet } from './lib/kk';

const root = fileURLToPath(new URL('..', import.meta.url));
const csvPath = process.argv[2];
if (!csvPath) throw new Error('Usage: npm run import:exam -- /path/to/ecdict.csv');
const data = readFileSync(resolve(csvPath));
if (createHash('sha256').update(data).digest('hex') !== ECDICT_SHA256) {
  throw new Error('Source checksum mismatch; use the pinned ECDICT CSV in docs/corpus.md.');
}
const rows = parse(data, { columns: true, skip_empty_lines: true }) as DictionaryRow[];
const lookup = dictionary as Record<string, string | undefined>;
const vocabDir = join(root, 'src/data/vocabulary');
const existing = new Set<string>();
for (const level of ['b2', 'c1', 'c2']) {
  for (const file of readdirSync(join(vocabDir, level))) {
    const entries = JSON.parse(readFileSync(join(vocabDir, level, file), 'utf8')) as VocabularyEntry[];
    entries.forEach((entry) => existing.add(entry.lemma));
  }
}
// Heteronyms need POS-specific pronunciation review before an automatic import.
const excluded = new Set(`abstract accent alternate appropriate associate bass bow buffet close compound compress conduct conflict console construct contest contract contrast converse convict coordinate deliberate desert digest discharge discount dove duplicate elaborate entrance escort estimate exploit export extract graduate house impact implant import incense increase insert insult intimate invalid lead live minute moderate object perfect permit present produce progress project protest read rebel record refuse reject row separate subject suspect tear use wind wound`.split(' '));
const priorities = new Set(readFileSync(join(root, 'scripts/data/exam-priorities.txt'), 'utf8').trim().split(/\s+/));
const overrides = JSON.parse(readFileSync(join(root, 'scripts/data/exam-definition-overrides.json'), 'utf8')) as Record<string, Pick<VocabularySense, 'partOfSpeech' | 'definitionEn' | 'definitionZh'>[]>;
const ranks = new Map(rows.map((row) => [row.word, frequencyRank(row)]));
const candidates = rows.filter((row) => {
  const tags = new Set(row.tag.split(' '));
  return /^[a-z]{4,}$/.test(row.word) && !existing.has(row.word) && !excluded.has(row.word)
    && (tags.has('toefl') || tags.has('gre')) && !tags.has('zk')
    && (frequencyRank(row) >= 1500 || priorities.has(row.word)) && lookup[row.word]
    && !/(?:^|\/)0:/.test(row.exchange);
}).sort((a, b) => Number(priorities.has(b.word)) - Number(priorities.has(a.word)) || frequencyRank(a) - frequencyRank(b) || a.word.localeCompare(b.word, 'en'));
const groups = { both: [] as VocabularyEntry[], toefl: [] as VocabularyEntry[], gre: [] as VocabularyEntry[] };
const seen = new Set(existing);
for (const row of candidates) {
  if (seen.has(row.word)) continue;
  const entry = dictionaryEntry(row, kkFromArpabet(lookup[row.word]!));
  if (!entry) continue;
  const definitions = overrides[entry.lemma];
  if (definitions) {
    entry.senses = definitions.map((sense) => ({ ...sense, id: `s_${entry.lemma}_${sense.partOfSpeech}`, examples: [] }));
  }
  vocabularyEntrySchema.parse(entry);
  const group = entry.tags.includes('toefl') ? (entry.tags.includes('gre') ? 'both' : 'toefl') : 'gre';
  groups[group].push(entry);
  seen.add(row.word);
}
function take(group: VocabularyEntry[], count: number, label: string): VocabularyEntry[] {
  if (group.length < count) throw new Error(`Insufficient eligible ${label} entries: ${group.length}`);
  return group.slice(0, count);
}
const academicShape = (entry: VocabularyEntry) => entry.senses.some((sense) =>
  sense.partOfSpeech === 'adjective' || sense.partOfSpeech === 'verb')
  || /(?:tion|sion|ity|ism|ence|ance|ology|graphy|cracy|ment|ness|sis)$/.test(entry.lemma)
  || priorities.has(entry.lemma);
const selected = [
  ...take(groups.both.filter((e) => ranks.get(e.lemma)! < 8000), 700, 'shared core'),
  ...take(groups.both.filter((e) => ranks.get(e.lemma)! >= 8000 && academicShape(e)), 300, 'shared advanced'),
  ...take(groups.toefl.filter((e) => ranks.get(e.lemma)! < 5000), 250, 'TOEFL core'),
  ...take(groups.toefl.filter((e) => ranks.get(e.lemma)! >= 5000), 250, 'TOEFL advanced'),
  ...take(groups.gre.filter((e) => (ranks.get(e.lemma)! >= 8000 || priorities.has(e.lemma)) && academicShape(e)), 500, 'GRE advanced'),
].sort((a, b) => a.lemma.localeCompare(b.lemma, 'en'));
// Validate all entries before writing any chunks. Only our dedicated directory is touched.
const output = join(vocabDir, 'exam');
mkdirSync(output, { recursive: true });
for (let offset = 0; offset < selected.length; offset += 50) {
  const name = `exam-${String(offset / 50 + 1).padStart(2, '0')}.json`;
  writeFileSync(join(output, name), `${JSON.stringify(selected.slice(offset, offset + 50), null, 2)}\n`);
}
console.log(`Imported ${selected.length} dictionary entries; ${existing.size + selected.length} total words.`);
console.log(JSON.stringify(Object.fromEntries(['B2', 'C1', 'C2'].map((level) => [level, selected.filter((entry) => entry.cefr === level).length]))));
