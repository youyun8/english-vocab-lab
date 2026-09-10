#!/usr/bin/env tsx
/** Deterministic, offline import. Download the pinned CSV described in docs/corpus.md first. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { vocabularyEntrySchema, type VocabularyEntry, type VocabularySense } from '../src/domain/vocabulary';
import { dictionaryEntry, ECDICT_SHA256, frequencyRank, type DictionaryRow } from './lib/ecdict';
import { kkFromArpabet } from './lib/kk';
import { applyBilingualLesson, loadBilingualLessons } from './lib/bilingual-lessons';

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
const hasTag = (row: DictionaryRow, tag: string) => row.tag.split(' ').includes(tag);
/** Structural eligibility, shared by both selection passes. */
const eligible = (row: DictionaryRow) =>
  /^[a-z]{4,}$/.test(row.word) && !existing.has(row.word) && !excluded.has(row.word)
    && !hasTag(row, 'zk')
    && (frequencyRank(row) >= 1500 || priorities.has(row.word)) && lookup[row.word]
    && !/(?:^|\/)0:/.test(row.exchange);
/** Hand-picked headwords first, then the most frequent; ties broken alphabetically. */
const byPriorityThenRank = (a: DictionaryRow, b: DictionaryRow) =>
  Number(priorities.has(b.word)) - Number(priorities.has(a.word))
  || frequencyRank(a) - frequencyRank(b)
  || a.word.localeCompare(b.word, 'en');

/** Every entry built so far, so the second pass reuses the first pass's work. */
const built = new Map<string, VocabularyEntry>();
/** Builds one entry, applying the editorial definition overrides. */
function buildEntry(row: DictionaryRow): VocabularyEntry | null {
  const cached = built.get(row.word);
  if (cached) return cached;
  const entry = dictionaryEntry(row, kkFromArpabet(lookup[row.word]!));
  if (!entry) return null;
  const definitions = overrides[entry.lemma];
  if (definitions) {
    entry.senses = definitions.map((sense) => ({ ...sense, id: `s_${entry.lemma}_${sense.partOfSpeech}`, examples: [] }));
  }
  vocabularyEntrySchema.parse(entry);
  built.set(row.word, entry);
  return entry;
}

// Pass 1 — the original TOEFL/GRE selection. Its inputs, order and quotas are
// deliberately untouched: the entries it picks keep their ids, so curated
// questions and saved learner progress keep pointing at real words.
const candidates = rows
  .filter((row) => eligible(row) && (hasTag(row, 'toefl') || hasTag(row, 'gre')))
  .sort(byPriorityThenRank);
const groups = { both: [] as VocabularyEntry[], toefl: [] as VocabularyEntry[], gre: [] as VocabularyEntry[] };
for (const row of candidates) {
  if (built.has(row.word)) continue; // A repeated headword row; the first one wins.
  const entry = buildEntry(row);
  if (!entry) continue;
  const group = entry.tags.includes('toefl') ? (entry.tags.includes('gre') ? 'both' : 'toefl') : 'gre';
  groups[group].push(entry);
}
function take(group: VocabularyEntry[], count: number, label: string): VocabularyEntry[] {
  if (group.length < count) throw new Error(`Insufficient eligible ${label} entries: ${group.length}`);
  return group.slice(0, count);
}
const academicShape = (entry: VocabularyEntry) => entry.senses.some((sense) =>
  sense.partOfSpeech === 'adjective' || sense.partOfSpeech === 'verb')
  || /(?:tion|sion|ity|ism|ence|ance|ology|graphy|cracy|ment|ness|sis)$/.test(entry.lemma)
  || priorities.has(entry.lemma);
const core = [
  ...take(groups.both.filter((e) => ranks.get(e.lemma)! < 8000), 700, 'shared core'),
  ...take(groups.both.filter((e) => ranks.get(e.lemma)! >= 8000 && academicShape(e)), 300, 'shared advanced'),
  ...take(groups.toefl.filter((e) => ranks.get(e.lemma)! < 5000), 250, 'TOEFL core'),
  ...take(groups.toefl.filter((e) => ranks.get(e.lemma)! >= 5000), 250, 'TOEFL advanced'),
  ...take(groups.gre.filter((e) => (ranks.get(e.lemma)! >= 8000 || priorities.has(e.lemma)) && academicShape(e)), 500, 'GRE advanced'),
];

// Pass 2 — a second tranche that widens the corpus without disturbing pass 1:
// the strongest TOEFL/GRE words that missed the first quotas, plus IELTS
// vocabulary, which pass 1 never considered.
const chosen = new Set(core.map((entry) => entry.lemma));
const widenedPool: VocabularyEntry[] = [];
const widenedSeen = new Set<string>();
for (const row of rows
  .filter((row) => eligible(row) && !chosen.has(row.word)
    && (hasTag(row, 'toefl') || hasTag(row, 'gre') || hasTag(row, 'ielts')))
  .sort(byPriorityThenRank)) {
  if (widenedSeen.has(row.word)) continue;
  const entry = buildEntry(row);
  if (!entry) continue;
  widenedSeen.add(row.word);
  widenedPool.push(entry);
}
/** Draws from a pool, never repeating a word already drawn in this pass. */
function draw(pool: VocabularyEntry[], count: number, label: string): VocabularyEntry[] {
  const picks = pool.filter((entry) => !chosen.has(entry.lemma)).slice(0, count);
  if (picks.length < count) throw new Error(`Insufficient eligible ${label} entries: ${picks.length}`);
  picks.forEach((entry) => chosen.add(entry.lemma));
  return picks;
}
const examTagged = (entry: VocabularyEntry) => entry.tags.includes('toefl') || entry.tags.includes('gre');
const widened = [
  ...draw(widenedPool.filter((e) => examTagged(e) && ranks.get(e.lemma)! < 12000), 1200, 'TOEFL/GRE core (pass 2)'),
  ...draw(widenedPool.filter((e) => e.tags.includes('gre') && ranks.get(e.lemma)! >= 12000 && academicShape(e)), 500, 'GRE advanced (pass 2)'),
  // IELTS below this rank is largely B1 revision, which this corpus is not for.
  ...draw(widenedPool.filter((e) => e.tags.includes('ielts') && ranks.get(e.lemma)! >= 3500), 300, 'IELTS'),
];
// Apply lessons after selection so editorial POS changes do not change the word list.
const lessons = loadBilingualLessons();
const selected = [...core, ...widened]
  .map((entry) => vocabularyEntrySchema.parse(applyBilingualLesson(entry, lessons)))
  .sort((a, b) => a.lemma.localeCompare(b.lemma, 'en'));
for (const lemma of lessons.keys()) {
  if (!selected.some((entry) => entry.lemma === lemma)) throw new Error(`Lesson missing from import: ${lemma}`);
}
// Validate all entries before writing any chunks. Only our dedicated directory is touched.
const output = join(vocabDir, 'exam');
mkdirSync(output, { recursive: true });
// A smaller selection than last time must not leave stale chunks behind.
for (const file of readdirSync(output)) {
  if (file.startsWith('exam-') && file.endsWith('.json')) rmSync(join(output, file));
}
for (let offset = 0; offset < selected.length; offset += 50) {
  const name = `exam-${String(offset / 50 + 1).padStart(2, '0')}.json`;
  writeFileSync(join(output, name), `${JSON.stringify(selected.slice(offset, offset + 50), null, 2)}\n`);
}
console.log(`Imported ${selected.length} dictionary entries; ${existing.size + selected.length} total words.`);
console.log(JSON.stringify(Object.fromEntries(['B2', 'C1', 'C2'].map((level) => [level, selected.filter((entry) => entry.cefr === level).length]))));
