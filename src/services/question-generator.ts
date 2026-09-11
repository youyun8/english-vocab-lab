import {
  OPTIONS_PER_QUESTION,
  generatedQuestionTypes,
  type Difficulty,
  type GeneratedQuestionType,
  type QuizQuestion,
  type QuestionType,
} from '@/domain/quiz';
import { shortMeaningZh, type CefrLevel, type VocabularyEntry } from '@/domain/vocabulary';
import type { Rng } from '@/utils/random';
import { shuffle } from '@/utils/random';

/**
 * Generated questions.
 *
 * Each entry yields **at most one** question, of the most demanding type it can
 * support. An earlier version emitted all three recognition types for every
 * word, which tripled the bank without teaching anything new: three near-identical
 * ways of asking "what does this word mean" is padding, not practice.
 *
 * The types, hardest first:
 *  1. `definition_to_word` — the word is blanked out of its own example sentence
 *     (or, failing that, out of its English definition) and the learner picks it
 *     from four English words. This is the TOEFL/GRE sentence-completion format:
 *     no Chinese to fall back on, and the sentence has to be read.
 *  2. `meaning_en_to_zh` — the headword in a real sentence, four Chinese glosses.
 *     Vocabulary in context rather than a flashcard.
 *  3. `meaning_zh_to_en` — a Chinese gloss and four English words. The easiest
 *     framing, used only for entries that cannot support the other two.
 *
 * Distractors are *ranked*, not drawn at random. A randomly chosen same-part-of-speech
 * word is usually unrelated enough to eliminate without knowing the answer, which
 * is what made the old bank easy. Candidates are scored on how nearly they miss —
 * shared prefix or suffix, same CEFR band, shared topic tags — and the three best
 * are used.
 *
 * Four safeguards keep the result fair:
 *  1. distractors match the answer's part of speech, so the answer can never be
 *     found by grammar alone;
 *  2. any entry whose gloss collides with the answer's gloss is rejected, so a
 *     question can never have two correct options;
 *  3. a gloss that *contains* the answer's gloss is rejected too — 走失的家畜
 *     next to 家畜 is two defensible answers, not one;
 *  4. an English definition or example that spells out its own headword is
 *     masked, so the prompt never contains the answer.
 *
 * They cannot prove that two dictionary meanings differ: near-synonyms worded
 * differently in the source (驅逐 against 消滅) still get through, and ranking
 * distractors by similarity deliberately pushes towards that boundary. Generated
 * questions are labelled as such throughout the app for that reason.
 */

export type GeneratedType = GeneratedQuestionType;

export const GENERATED_TYPES: GeneratedType[] = [...generatedQuestionTypes];

/** Hardest first. The first type an entry can support is the one it gets. */
const TYPE_PRIORITY: GeneratedType[] = [
  'definition_to_word',
  'meaning_en_to_zh',
  'meaning_zh_to_en',
];

const DISTRACTOR_COUNT = OPTIONS_PER_QUESTION - 1;

/** Definitions longer than this are cut at a clause boundary before display. */
const MAX_DEFINITION_LENGTH = 140;
/** Placeholder written over the headword when a text spells it out. */
const MASK = '___';
/** Below these thresholds a masked definition no longer identifies one word. */
const MIN_DEFINITION_WORDS = 3;
const MIN_DEFINITION_LENGTH = 12;
/** A sentence shorter than this carries too little context to complete. */
const MIN_CLOZE_WORDS = 6;
/** Shorter stems collide with unrelated words too often to mask on. */
const MIN_STEM_LENGTH = 4;
/** Imported glosses list every sense; a whole list makes an unreadable option. */
const MAX_GLOSS_SEGMENTS = 3;

function primaryPos(entry: VocabularyEntry): string {
  return entry.senses[0]?.partOfSpeech ?? 'other';
}

/**
 * The Chinese gloss as an option: the leading senses only. The generator's
 * ambiguity checks already work per gloss segment, so trimming can only make
 * two options collide, never make a wrong option defensible — and a collision
 * is dropped rather than shown.
 */
function optionGlossZh(entry: VocabularyEntry): string {
  const segments = shortMeaningZh(entry)
    .split(/[；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.slice(0, MAX_GLOSS_SEGMENTS).join('；') || shortMeaningZh(entry);
}

function primaryDefinitionEn(entry: VocabularyEntry): string {
  return entry.senses[0]?.definitionEn.trim() ?? '';
}

/**
 * Imported dictionary glosses are long, semicolon-separated lists. Keeping the
 * leading clauses reads better as a prompt and never changes the answer.
 * A dangling opening parenthesis marks a truncated import, so the fragment
 * after it is dropped rather than shown.
 */
function shortDefinitionEn(entry: VocabularyEntry): string {
  const definition = primaryDefinitionEn(entry).replace(/^\([^)]*\)\s*/, '');
  const balanced = definition.includes('(') && !definition.includes(')')
    ? definition.slice(0, definition.indexOf('(')).trim()
    : definition;
  if (balanced.length <= MAX_DEFINITION_LENGTH) return balanced;
  const clauses = balanced.split(/;\s*/);
  let text = clauses[0] ?? balanced;
  for (const clause of clauses.slice(1)) {
    if (`${text}; ${clause}`.length > MAX_DEFINITION_LENGTH) break;
    text = `${text}; ${clause}`;
  }
  return text.slice(0, MAX_DEFINITION_LENGTH).trim();
}

/**
 * Blanks out the headword wherever the text happens to spell it out (ECDICT
 * glosses such as "become brisk" do, and an entry's own example always does),
 * so the prompt cannot give the answer away. Derived forms count: "make an
 * alteration to" would hand the reader `alter`.
 */
function maskLemma(text: string, lemma: string): string {
  const stem = lemma.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (stem.length < MIN_STEM_LENGTH) return text;
  return text.replace(/[A-Za-z]+/g, (word) =>
    sharesRoot(word.toLowerCase(), stem) ? MASK : word,
  );
}

/** True when two words share enough of a prefix to be forms of one another. */
function sharesRoot(word: string, stem: string): boolean {
  const shorter = Math.min(word.length, stem.length);
  let shared = 0;
  while (shared < shorter && word[shared] === stem[shared]) shared += 1;
  return shared >= MIN_STEM_LENGTH && shared >= shorter * 0.7;
}

/**
 * A masked text is only usable as a prompt when enough of it survives.
 * "become ___" or "in a ___ manner" identify nothing, so those entries simply
 * fall through to an easier question type.
 */
function isUsableDefinitionPrompt(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word && word !== MASK);
  return words.length >= MIN_DEFINITION_WORDS && words.join(' ').length >= MIN_DEFINITION_LENGTH;
}

function countMasks(text: string): number {
  return text.split(MASK).length - 1;
}

/**
 * The entry's own example sentence with the headword blanked out — the closest
 * the corpus can get to a real sentence-completion item without hand authoring.
 *
 * A sentence with two blanks has two things to guess rather than one, and a
 * sentence that never mentions the headword cannot be completed with it, so
 * both are skipped in favour of the next candidate example.
 *
 * The gap must also hold the bare lemma. `maskLemma` blanks any inflected form,
 * but the options are bare lemmas, so blanking "retained" and marking "retain"
 * correct would ask the learner to accept a sentence that is not English.
 */
function clozeStem(entry: VocabularyEntry): string {
  const lemma = entry.lemma.trim().toLowerCase();
  for (const sense of entry.senses) {
    for (const example of sense.examples) {
      const source = example.en.trim();
      const masked = maskLemma(source, entry.lemma);
      if (masked === source) continue;
      if (countMasks(masked) !== 1) continue;
      const blanked = (source.match(/[A-Za-z]+/g) ?? [])
        .find((word) => maskLemma(word, entry.lemma) === MASK);
      if (blanked?.toLowerCase() !== lemma) continue;
      if (masked.split(/\s+/).filter((word) => word && word !== MASK).length < MIN_CLOZE_WORDS) {
        continue;
      }
      return masked;
    }
  }
  return '';
}

/**
 * The entry's own example, left intact — context for a meaning question.
 *
 * Only the primary sense's examples qualify. The correct option is the primary
 * sense's gloss, so a sentence illustrating a later sense would mark the wrong
 * meaning correct — on the one question type whose whole purpose is telling
 * senses apart. The sentence must also contain the headword it asks about.
 */
function exampleSentence(entry: VocabularyEntry): string {
  for (const example of entry.senses[0]?.examples ?? []) {
    const text = example.en.trim();
    if (text.split(/\s+/).filter(Boolean).length < MIN_CLOZE_WORDS) continue;
    if (maskLemma(text, entry.lemma) === text) continue;
    return text;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

/** A gloss this short identifies nothing on its own. */
const MIN_GLOSS_LENGTH = 2;
/**
 * Glosses that are bare grammatical residue rather than a meaning. An imported
 * entry whose primary gloss is one of these cannot anchor a question: every
 * distractor would be "wrong" for reasons the learner has no way to see.
 */
const VAGUE_GLOSS = /^(的|地|得|了|著|等|某|其|之|及|與|和|一個|一種|某種|這樣|那樣|如此|某些)$/;

/**
 * Whether an entry carries enough meaning to build a fair question from.
 *
 * Some imported entries are function words or one-character glosses. Generating
 * for them produced items where no option was defensible, which is worse than
 * having no question for the word at all — the word is still browsable and can
 * still appear in curated questions, it just is not quizzed.
 *
 * A thin *English* definition is not disqualifying: it only rules out the
 * definition question, which `stemRequired` already handles, and the entry can
 * still be quizzed on its Chinese gloss.
 */
function isTestable(entry: VocabularyEntry): boolean {
  const gloss = optionGlossZh(entry).trim();
  if (gloss.length < MIN_GLOSS_LENGTH || VAGUE_GLOSS.test(gloss)) return false;
  return primaryDefinitionEn(entry).length > 0;
}

interface MeaningIndex {
  glosses: Set<string>;
  definitions: Set<string>;
  synonyms: Set<string>;
}
const meaningCache = new WeakMap<VocabularyEntry, MeaningIndex>();

function meaningIndex(entry: VocabularyEntry): MeaningIndex {
  const cached = meaningCache.get(entry);
  if (cached) return cached;
  const value = {
    glosses: new Set(entry.senses.flatMap((sense) => sense.definitionZh
      .replace(/[（(][^）)]*[）)]/g, '')
      .split(/[；;，,、]/).map((gloss) => gloss.trim()).filter(Boolean))),
    definitions: new Set(entry.senses.map((sense) => sense.definitionEn.trim().toLowerCase())),
    synonyms: new Set((entry.synonyms ?? []).map((word) => word.lemma.toLowerCase())),
  };
  meaningCache.set(entry, value);
  return value;
}

interface DistractorIndex {
  pool: VocabularyEntry[];
  byPos: Map<string, VocabularyEntry[]>;
  byLemma: Map<string, VocabularyEntry[]>;
  byGloss: Map<string, VocabularyEntry[]>;
  /** Every substring of every gloss, to catch one gloss containing another. */
  byGlossPart: Map<string, VocabularyEntry[]>;
  byDefinition: Map<string, VocabularyEntry[]>;
  reverseSynonyms: Map<string, VocabularyEntry[]>;
  /** Lemmas that begin alike — the look-alikes an exam would put side by side. */
  byPrefix: Map<string, VocabularyEntry[]>;
  /** Lemmas that end alike, which is usually a shared derivational suffix. */
  bySuffix: Map<string, VocabularyEntry[]>;
}

/** Shorter fragments match by coincidence rather than by meaning. */
const MIN_GLOSS_FRAGMENT = 2;
/** Lemma affixes indexed for look-alike lookup. */
const PREFIX_LENGTH = 3;
const SUFFIX_LENGTH = 4;

/** Every substring of a gloss segment that is long enough to mean something. */
function glossFragments(gloss: string): string[] {
  const fragments: string[] = [];
  for (let start = 0; start < gloss.length; start += 1) {
    for (let end = start + MIN_GLOSS_FRAGMENT; end <= gloss.length; end += 1) {
      fragments.push(gloss.slice(start, end));
    }
  }
  return fragments;
}

function indexDistractors(pool: VocabularyEntry[]): DistractorIndex {
  const index: DistractorIndex = {
    pool, byPos: new Map(), byLemma: new Map(), byGloss: new Map(), byGlossPart: new Map(),
    byDefinition: new Map(), reverseSynonyms: new Map(), byPrefix: new Map(), bySuffix: new Map(),
  };
  const add = (map: Map<string, VocabularyEntry[]>, key: string, entry: VocabularyEntry) => {
    const values = map.get(key) ?? [];
    values.push(entry);
    map.set(key, values);
  };
  for (const entry of pool) {
    const meaning = meaningIndex(entry);
    const lemma = entry.lemma.toLowerCase();
    add(index.byPos, primaryPos(entry), entry);
    add(index.byLemma, lemma, entry);
    if (lemma.length >= PREFIX_LENGTH) add(index.byPrefix, lemma.slice(0, PREFIX_LENGTH), entry);
    if (lemma.length >= SUFFIX_LENGTH) add(index.bySuffix, lemma.slice(-SUFFIX_LENGTH), entry);
    for (const gloss of meaning.glosses) {
      add(index.byGloss, gloss, entry);
      for (const fragment of new Set(glossFragments(gloss))) {
        add(index.byGlossPart, fragment, entry);
      }
    }
    for (const definition of meaning.definitions) add(index.byDefinition, definition, entry);
    for (const synonym of meaning.synonyms) add(index.reverseSynonyms, synonym, entry);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Near-miss ranking
// ---------------------------------------------------------------------------

function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < limit && a[shared] === b[shared]) shared += 1;
  return shared;
}

function sharedSuffixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let shared = 0;
  while (shared < limit && a[a.length - 1 - shared] === b[b.length - 1 - shared]) shared += 1;
  return shared;
}

/**
 * How nearly a candidate misses being the answer. Higher is a better distractor:
 * a word that looks like the answer, sits at the same level and belongs to the
 * same topic forces the learner to actually know the meaning, where an unrelated
 * word can be dismissed on sight.
 */
function nearMissScore(target: VocabularyEntry, candidate: VocabularyEntry): number {
  const a = target.lemma.toLowerCase();
  const b = candidate.lemma.toLowerCase();
  let score = 0;

  const prefix = sharedPrefixLength(a, b);
  if (prefix >= 4) score += 5;
  else if (prefix >= 3) score += 3;

  const suffix = sharedSuffixLength(a, b);
  if (suffix >= 4) score += 3;
  else if (suffix >= 3) score += 2;

  if (candidate.cefr === target.cefr) score += 2;

  const sharedTags = candidate.tags.filter((tag) => target.tags.includes(tag)).length;
  score += Math.min(sharedTags, 2) * 2;

  if (Math.abs(a.length - b.length) <= 2) score += 1;

  return score;
}

/** Stable, seed-free hash so a word always samples the same slice of the pool. */
function hashLemma(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Look-alike buckets are read whole; the general pool is sampled this widely. */
const POOL_SAMPLE = 96;
/** An upper bound on scoring work per question. */
const MAX_CANDIDATES = 48;

/**
 * The candidates worth scoring, without walking the whole corpus per question.
 *
 * Look-alike buckets are small and are taken whole. The rest is a strided sample
 * of the same-part-of-speech pool, offset by a hash of the headword so different
 * words sample different neighbourhoods rather than all reusing the first words
 * in the corpus.
 *
 * The look-alike buckets are keyed on spelling alone, so they have to be filtered
 * back down to the answer's part of speech: offering "retail" and "retailer"
 * against "are ___ for ninety days" lets a learner find the answer by grammar
 * without knowing the word. The filter lifts only when matching the part of
 * speech would leave too few candidates to fill the options.
 */
function gatherCandidates(target: VocabularyEntry, index: DistractorIndex): VocabularyEntry[] {
  const lemma = target.lemma.toLowerCase();
  const pos = primaryPos(target);
  const samePos = index.byPos.get(pos) ?? [];
  const posOnly = samePos.length >= POOL_SAMPLE;
  const seen = new Set<string>([target.id]);
  const gathered: VocabularyEntry[] = [];
  const take = (entries: VocabularyEntry[]) => {
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      if (posOnly && primaryPos(entry) !== pos) continue;
      seen.add(entry.id);
      gathered.push(entry);
    }
  };

  take(index.byPrefix.get(lemma.slice(0, PREFIX_LENGTH)) ?? []);
  take(index.bySuffix.get(lemma.slice(-SUFFIX_LENGTH)) ?? []);

  const pool = samePos.length >= OPTIONS_PER_QUESTION ? samePos : index.pool;
  if (pool.length > 0) {
    const step = Math.max(1, Math.floor(pool.length / POOL_SAMPLE));
    const start = hashLemma(lemma) % pool.length;
    for (let taken = 0; taken < POOL_SAMPLE; taken += 1) {
      const entry = pool[(start + taken * step) % pool.length];
      if (entry) take([entry]);
    }
  }
  return gathered;
}

/** The entries a question may draw distractors from, and those it must not. */
interface CandidatePool {
  /** Best near-misses first; scanned before `fallback`. */
  entries: VocabularyEntry[];
  /** The rest of the same-part-of-speech pool, held unjoined — see below. */
  fallback: VocabularyEntry[];
  forbidden: Set<string>;
}

/**
 * Inverted gloss indexes avoid comparing every pair of definitions at corpus
 * scale. The forbidden ids are returned rather than filtered out, so no
 * per-entry copy of the corpus is allocated while generating.
 */
function candidateDistractors(target: VocabularyEntry, index: DistractorIndex): CandidatePool {
  const forbidden = new Set([target.id]);
  const exclude = (entries: VocabularyEntry[]) => entries.forEach((entry) => forbidden.add(entry.id));
  const related = [target, ...(index.reverseSynonyms.get(target.lemma.toLowerCase()) ?? [])];
  for (const lemma of meaningIndex(target).synonyms) {
    related.push(...(index.byLemma.get(lemma) ?? []));
  }
  for (const entry of related) {
    forbidden.add(entry.id);
    const meaning = meaningIndex(entry);
    for (const gloss of meaning.glosses) {
      exclude(index.byGloss.get(gloss) ?? []);
      // A gloss that spells out this one — 走失的家畜 for 家畜 — and a gloss
      // this one spells out — 感激 for 感激之情 — are both defensible answers.
      if (gloss.length >= MIN_GLOSS_FRAGMENT) exclude(index.byGlossPart.get(gloss) ?? []);
      for (const fragment of new Set(glossFragments(gloss))) {
        exclude(index.byGloss.get(fragment) ?? []);
      }
    }
    for (const definition of meaning.definitions) exclude(index.byDefinition.get(definition) ?? []);
  }

  const ranked = gatherCandidates(target, index)
    .filter((candidate) => !forbidden.has(candidate.id))
    .map((candidate) => ({ candidate, score: nearMissScore(target, candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.lemma.localeCompare(b.candidate.lemma))
    .slice(0, MAX_CANDIDATES)
    .map((scored) => scored.candidate);

  const samePos = index.byPos.get(primaryPos(target)) ?? [];
  // Matching the part of speech is preferred, but only while it can still
  // supply three usable distractors; otherwise the whole pool is fair game.
  // Kept as its own array rather than spread onto `ranked`: joining them would
  // copy the whole pool for every entry generated, and the scan almost never
  // reaches past the ranked near-misses anyway.
  const fallback = samePos.length - forbidden.size >= DISTRACTOR_COUNT ? samePos : index.pool;
  return { entries: ranked, fallback, forbidden };
}

function buildOptions(texts: string[]): { id: string; text: string }[] {
  return texts.map((text, index) => ({ id: `o${index + 1}`, text }));
}

/** A question's stem: the text above the options, and the instruction for it. */
interface Stem {
  text: string;
  prompt: string;
}

/**
 * Per-type recipe. `optionText` is what the learner picks between, so it also
 * decides which distractors would read as duplicates.
 */
interface RecognitionSpec {
  idSuffix: string;
  tag: string;
  /** Added to the CEFR baseline: formats with no Chinese to lean on are harder. */
  difficultyBonus: number;
  optionText: (entry: VocabularyEntry) => string;
  /** The stem, or null when this entry cannot produce one. */
  stem: (entry: VocabularyEntry) => Stem | null;
  /** When true, an entry with no stem cannot produce this type at all. */
  stemRequired: boolean;
  /** Used when `stem` returns null and the type does not require one. */
  defaultPrompt: (entry: VocabularyEntry) => string;
  explanation: (entry: VocabularyEntry) => string;
}

const SPECS: Record<GeneratedType, RecognitionSpec> = {
  definition_to_word: {
    idSuffix: 'd2w',
    tag: 'definition',
    difficultyBonus: 1,
    optionText: (entry) => entry.lemma,
    // A real sentence with a gap is the exam format; a masked definition is the
    // fallback for entries whose example does not use the headword.
    stem: (entry) => {
      const sentence = clozeStem(entry);
      if (sentence) return { text: sentence, prompt: '選出最適合填入空格的單字。' };
      const masked = maskLemma(shortDefinitionEn(entry), entry.lemma);
      if (!isUsableDefinitionPrompt(masked)) return null;
      return { text: masked, prompt: '哪一個單字符合下面的英文釋義？' };
    },
    stemRequired: true,
    defaultPrompt: () => '哪一個單字符合下面的英文釋義？',
    explanation: (entry) =>
      `${entry.lemma}（${entry.pronunciation.kk}）：${primaryDefinitionEn(entry)}｜${shortMeaningZh(entry)}`,
  },
  meaning_en_to_zh: {
    idSuffix: 'e2z',
    tag: 'meaning',
    difficultyBonus: 1,
    optionText: (entry) => optionGlossZh(entry),
    // The headword is left visible here: the question is which sense it carries
    // in this sentence, so hiding it would change what is being tested.
    stem: (entry) => {
      const sentence = exampleSentence(entry);
      if (!sentence) return null;
      return { text: sentence, prompt: `在下面的句子中，"${entry.lemma}" 最接近哪個意思？` };
    },
    stemRequired: false,
    defaultPrompt: (entry) => `"${entry.lemma}" 最接近下列哪個意思？`,
    explanation: (entry) =>
      `${entry.lemma}：${shortMeaningZh(entry)}。${primaryDefinitionEn(entry)}`,
  },
  meaning_zh_to_en: {
    idSuffix: 'z2e',
    tag: 'meaning',
    difficultyBonus: 0,
    optionText: (entry) => entry.lemma,
    stem: (entry) => {
      const sentence = clozeStem(entry);
      if (!sentence) return null;
      return {
        text: sentence,
        prompt: `哪一個單字意思是「${optionGlossZh(entry)}」，並且最適合填入空格？`,
      };
    },
    stemRequired: false,
    defaultPrompt: (entry) => `哪一個英文單字最接近「${optionGlossZh(entry)}」？`,
    explanation: (entry) =>
      `「${shortMeaningZh(entry)}」對應的英文是 ${entry.lemma}（${entry.pronunciation.kk}）。`,
  },
};

/** The identity of a generated question, derivable without generating it. */
export interface GeneratedQuestionMeta {
  id: string;
  difficulty: Difficulty;
  tags: string[];
}

/**
 * Difficulty baseline per band. The old scale bottomed out at 1, which said a
 * C-level word was an easy question just because the format was simple; these
 * items are all sentence-level with ranked distractors, so none of them is.
 */
const CEFR_BASE: Record<CefrLevel, number> = { B2: 2, C1: 3, C2: 4 };

/**
 * Everything about a generated question except its options: id, difficulty and
 * tags. The question bank derives these from index records so it can count,
 * filter and order the whole bank without building any of it.
 */
export function generatedQuestionMeta(
  word: { id: string; cefr: CefrLevel; tags: string[] },
  type: GeneratedType,
): GeneratedQuestionMeta {
  const spec = SPECS[type];
  const difficulty = Math.min(5, Math.max(1, CEFR_BASE[word.cefr] + spec.difficultyBonus));
  return {
    id: `q_gen_${word.id.replace(/^w_/, '')}_${spec.idSuffix}`,
    difficulty: difficulty as Difficulty,
    tags: ['generated', spec.tag, ...word.tags.slice(0, 2)],
  };
}

/**
 * How the corpus is spread across the three formats, as cumulative percentiles
 * of a hash of the headword.
 *
 * Almost every entry can support the sentence-completion format, so choosing
 * purely by difficulty would give all four thousand words the identical item
 * and make the question-type filter meaningless. The split keeps that format
 * dominant while still drilling sense discrimination (`meaning_en_to_zh`) and
 * recall (`meaning_zh_to_en`) on a minority of words. It is a hash rather than
 * a counter so a word's format never depends on what else was generated.
 */
const TYPE_SHARES: { type: GeneratedType; upTo: number }[] = [
  { type: 'meaning_zh_to_en', upTo: 10 },
  { type: 'meaning_en_to_zh', upTo: 30 },
  { type: 'definition_to_word', upTo: 100 },
];

/** Whether this entry can carry this type, stem included. */
function supports(entry: VocabularyEntry, type: GeneratedType): boolean {
  const spec = SPECS[type];
  if (!spec.optionText(entry).trim()) return false;
  // A stem is insisted on even where the type does not strictly need one: an
  // option list with no sentence above it is the flashcard this bank moved away
  // from. Entries with no usable sentence fall through to the priority order.
  return spec.stem(entry) != null;
}

/**
 * The single type this entry produces, ignoring the distractor pool — an empty
 * array when the entry is too thin to quiz fairly.
 *
 * The vocabulary index records the answer, so the question bank can count and
 * order its questions without generating any of them. That makes this function
 * a contract: it must return the same type here and at generation time, or a
 * counted question would fail to materialise. Everything it reads is a property
 * of the entry alone, so the two agree by construction.
 */
export function generatedTypesFor(entry: VocabularyEntry): GeneratedType[] {
  if (!isTestable(entry)) return [];

  const bucket = hashLemma(entry.id) % 100;
  const assigned = TYPE_SHARES.find((share) => bucket < share.upTo)?.type;
  if (assigned && supports(entry, assigned)) return [assigned];

  // The assigned format did not fit this word; fall back to the hardest one it
  // can carry.
  for (const type of TYPE_PRIORITY) {
    const spec = SPECS[type];
    if (!spec.optionText(entry).trim()) continue;
    if (spec.stemRequired && !spec.stem(entry)) continue;
    return [type];
  }
  return [];
}

interface GenerateOptions {
  rng: Rng;
  candidates: CandidatePool;
}

function generateForEntry(
  entry: VocabularyEntry,
  type: GeneratedType,
  { rng, candidates }: GenerateOptions,
): QuizQuestion | null {
  if (candidates.entries.length + candidates.fallback.length < DISTRACTOR_COUNT) return null;

  const spec = SPECS[type];
  const answerText = spec.optionText(entry).trim();
  if (!answerText) return null;

  const stem = spec.stem(entry);
  if (spec.stemRequired && !stem) return null;

  // The pool arrives ranked, so a straight scan takes the three nearest misses
  // that survive the ambiguity checks. Scanning beats random draws twice over:
  // the distractors are better, and nothing depends on how lucky the seed was.
  const distractors: VocabularyEntry[] = [];
  const usedTexts = new Set<string>([answerText.toLowerCase()]);
  const seen = new Set<string>();
  for (const pool of [candidates.entries, candidates.fallback]) {
    for (const candidate of pool) {
      if (distractors.length >= DISTRACTOR_COUNT) break;
      if (seen.has(candidate.id) || candidates.forbidden.has(candidate.id)) continue;
      seen.add(candidate.id);
      const text = spec.optionText(candidate).trim().toLowerCase();
      if (!text || usedTexts.has(text)) continue;
      usedTexts.add(text);
      distractors.push(candidate);
    }
  }
  if (distractors.length < DISTRACTOR_COUNT) return null;

  const allTexts = [answerText, ...distractors.map((candidate) => spec.optionText(candidate))];
  // Defensive: never emit a question with duplicated option text.
  if (new Set(allTexts.map((text) => text.trim().toLowerCase())).size !== allTexts.length) {
    return null;
  }

  const options = buildOptions(shuffle(allTexts, rng));
  const correct = options.find((option) => option.text === answerText);
  if (!correct) return null;

  const meta = generatedQuestionMeta(entry, type);
  return {
    id: meta.id,
    type,
    cefr: entry.cefr,
    wordIds: [entry.id],
    prompt: stem?.prompt ?? spec.defaultPrompt(entry),
    ...(stem ? { context: stem.text } : {}),
    options,
    correctOptionId: correct.id,
    explanation: spec.explanation(entry),
    difficulty: meta.difficulty,
    tags: meta.tags,
    source: 'generated',
  };
}

function isGeneratedType(type: QuestionType): type is GeneratedType {
  return (GENERATED_TYPES as QuestionType[]).includes(type);
}

/**
 * Generates one recognition question per entry, for entries that can carry one.
 *
 * `types` filters which questions are wanted, but it cannot change which type an
 * entry produces: a word whose type is not requested yields nothing rather than
 * falling back to an easier framing, so an id counted from the index always
 * matches the question built here.
 *
 * Duplicate ids can never occur because the id is derived from `entry.id` and
 * the entry's single question type.
 */
export function generateQuestions(
  entries: VocabularyEntry[],
  options: { rng: Rng; types?: QuestionType[]; pool?: VocabularyEntry[] },
): QuizQuestion[] {
  const wanted = new Set((options.types ?? GENERATED_TYPES).filter(isGeneratedType));
  if (wanted.size === 0) return [];

  const pool = options.pool ?? entries;
  const generated: QuizQuestion[] = [];
  const index = indexDistractors(pool);

  for (const entry of entries) {
    const [type] = generatedTypesFor(entry);
    if (!type || !wanted.has(type)) continue;
    const candidates = candidateDistractors(entry, index);
    const question = generateForEntry(entry, type, { rng: options.rng, candidates });
    if (question) generated.push(question);
  }
  return generated;
}
