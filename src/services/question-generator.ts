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
 * Only *simple recognition* questions are generated: English -> Chinese,
 * Chinese -> English, and English definition -> English word. Anything that
 * depends on nuance (usage, collocation, grammar, confusing words) stays
 * curated, because a generator cannot reliably guarantee that exactly one
 * option is defensible.
 *
 * Every generated type works from fields the schema guarantees on *every*
 * entry (lemma, Chinese gloss, English definition), so the whole corpus —
 * imported dictionary words included — gets practice, not just the small
 * hand-written subset.
 *
 * Three safeguards keep generated questions fair:
 *  1. distractors are drawn from entries whose part of speech matches, so the
 *     answer can never be found by grammar alone;
 *  2. any entry whose gloss collides with the answer's gloss is rejected, so a
 *     question can never have two correct options;
 *  3. an English definition that spells out its own headword is masked, so the
 *     prompt never contains the answer.
 */

export type GeneratedType = GeneratedQuestionType;

export const GENERATED_TYPES: GeneratedType[] = [...generatedQuestionTypes];

const DISTRACTOR_COUNT = OPTIONS_PER_QUESTION - 1;

/** Definitions longer than this are cut at a clause boundary before display. */
const MAX_DEFINITION_LENGTH = 140;
/** Placeholder written over the headword when a definition spells it out. */
const MASK = '___';
/** Below these thresholds a masked definition no longer identifies one word. */
const MIN_DEFINITION_WORDS = 3;
const MIN_DEFINITION_LENGTH = 12;
/** Shorter stems collide with unrelated words too often to mask on. */
const MIN_STEM_LENGTH = 4;
/** Imported glosses list every sense; a whole list makes an unreadable option. */
const MAX_GLOSS_SEGMENTS = 3;
/** Random draws allowed before falling back to a scan of the candidate pool. */
const DRAW_BUDGET = 32;

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
 * Blanks out the headword wherever the definition happens to spell it out
 * (ECDICT glosses such as "become brisk" do), so the prompt cannot give the
 * answer away. Derived forms count: "make an alteration to" would hand the
 * reader `alter`.
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
 * A masked definition is only usable as a prompt when enough of it survives.
 * "become ___" or "in a ___ manner" identify nothing, so those entries simply
 * get no definition question.
 */
function isUsableDefinitionPrompt(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => word && word !== MASK);
  return words.length >= MIN_DEFINITION_WORDS && words.join(' ').length >= MIN_DEFINITION_LENGTH;
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
  byDefinition: Map<string, VocabularyEntry[]>;
  reverseSynonyms: Map<string, VocabularyEntry[]>;
}

function indexDistractors(pool: VocabularyEntry[]): DistractorIndex {
  const index: DistractorIndex = {
    pool, byPos: new Map(), byLemma: new Map(), byGloss: new Map(),
    byDefinition: new Map(), reverseSynonyms: new Map(),
  };
  const add = (map: Map<string, VocabularyEntry[]>, key: string, entry: VocabularyEntry) => {
    const values = map.get(key) ?? [];
    values.push(entry);
    map.set(key, values);
  };
  for (const entry of pool) {
    const meaning = meaningIndex(entry);
    add(index.byPos, primaryPos(entry), entry);
    add(index.byLemma, entry.lemma.toLowerCase(), entry);
    for (const gloss of meaning.glosses) add(index.byGloss, gloss, entry);
    for (const definition of meaning.definitions) add(index.byDefinition, definition, entry);
    for (const synonym of meaning.synonyms) add(index.reverseSynonyms, synonym, entry);
  }
  return index;
}

/** The entries a question may draw distractors from, and those it must not. */
interface CandidatePool {
  entries: VocabularyEntry[];
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
    for (const gloss of meaning.glosses) exclude(index.byGloss.get(gloss) ?? []);
    for (const definition of meaning.definitions) exclude(index.byDefinition.get(definition) ?? []);
  }
  const samePos = index.byPos.get(primaryPos(target)) ?? [];
  // Matching the part of speech is preferred, but only while it can still
  // supply three usable distractors; otherwise the whole pool is fair game.
  const entries = samePos.length - forbidden.size >= DISTRACTOR_COUNT ? samePos : index.pool;
  return { entries, forbidden };
}

function buildOptions(texts: string[]): { id: string; text: string }[] {
  return texts.map((text, index) => ({ id: `o${index + 1}`, text }));
}

/**
 * Per-type recipe. `optionText` is what the learner picks between, so it also
 * decides which distractors would read as duplicates.
 */
interface RecognitionSpec {
  idSuffix: string;
  optionText: (entry: VocabularyEntry) => string;
  prompt: (entry: VocabularyEntry) => string;
  context?: (entry: VocabularyEntry) => string;
  explanation: (entry: VocabularyEntry) => string;
  tag: string;
}

const SPECS: Record<GeneratedType, RecognitionSpec> = {
  meaning_en_to_zh: {
    idSuffix: 'e2z',
    optionText: (entry) => optionGlossZh(entry),
    prompt: (entry) => `What does "${entry.lemma}" most nearly mean?`,
    explanation: (entry) =>
      `${entry.lemma}：${shortMeaningZh(entry)}。${primaryDefinitionEn(entry)}`,
    tag: 'meaning',
  },
  meaning_zh_to_en: {
    idSuffix: 'z2e',
    optionText: (entry) => entry.lemma,
    prompt: (entry) => `哪一個英文單字最接近「${optionGlossZh(entry)}」？`,
    explanation: (entry) =>
      `「${shortMeaningZh(entry)}」對應的英文是 ${entry.lemma}（${entry.pronunciation.kk}）。`,
    tag: 'meaning',
  },
  definition_to_word: {
    idSuffix: 'd2w',
    optionText: (entry) => entry.lemma,
    prompt: () => '哪一個單字符合下面的英文釋義？',
    context: (entry) => {
      const masked = maskLemma(shortDefinitionEn(entry), entry.lemma);
      // An empty context makes `generateForEntry` skip this type for the entry.
      return isUsableDefinitionPrompt(masked) ? masked : '';
    },
    explanation: (entry) =>
      `${entry.lemma}（${entry.pronunciation.kk}）：${primaryDefinitionEn(entry)}｜${shortMeaningZh(entry)}`,
    tag: 'definition',
  },
};

/** The identity of a generated question, derivable without generating it. */
export interface GeneratedQuestionMeta {
  id: string;
  difficulty: Difficulty;
  tags: string[];
}

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
  return {
    id: `q_gen_${word.id.replace(/^w_/, '')}_${spec.idSuffix}`,
    difficulty: word.cefr === 'B2' ? 1 : word.cefr === 'C1' ? 2 : 3,
    tags: ['generated', spec.tag, ...word.tags.slice(0, 2)],
  };
}

/**
 * Which types this entry can produce, ignoring the distractor pool.
 *
 * Both meaning types work from fields every entry has; the definition type
 * needs a definition that still identifies the word once its own headword is
 * masked out. The vocabulary index records the answer, so the question bank can
 * count and order its questions without generating any of them.
 */
export function generatedTypesFor(entry: VocabularyEntry): GeneratedType[] {
  return GENERATED_TYPES.filter((type) => {
    const spec = SPECS[type];
    if (!spec.optionText(entry).trim()) return false;
    return spec.context ? spec.context(entry).trim().length > 0 : true;
  });
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
  const pool = candidates.entries;
  if (pool.length < DISTRACTOR_COUNT) return null;

  const spec = SPECS[type];
  const answerText = spec.optionText(entry).trim();
  if (!answerText) return null;

  const context = spec.context?.(entry).trim();
  if (spec.context && !context) return null;

  // Random draws rather than a full shuffle: the candidate pool is the whole
  // corpus for a part of speech, and shuffling it for every question made
  // building the bank cost seconds rather than milliseconds.
  const distractors: VocabularyEntry[] = [];
  const usedTexts = new Set<string>([answerText.toLowerCase()]);
  const tried = new Set<number>();
  const accept = (index: number): boolean => {
    if (tried.has(index)) return false;
    tried.add(index);
    const candidate = pool[index];
    if (!candidate || candidates.forbidden.has(candidate.id)) return false;
    const text = spec.optionText(candidate).trim().toLowerCase();
    if (!text || usedTexts.has(text)) return false;
    usedTexts.add(text);
    distractors.push(candidate);
    return true;
  };

  for (let attempt = 0; attempt < DRAW_BUDGET && distractors.length < DISTRACTOR_COUNT; attempt += 1) {
    accept(Math.floor(rng() * pool.length));
  }
  // Small or highly duplicated pools may not yield three draws; finish by scan.
  for (let index = 0; index < pool.length && distractors.length < DISTRACTOR_COUNT; index += 1) {
    accept(index);
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
    prompt: spec.prompt(entry),
    ...(context ? { context } : {}),
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
 * Generates recognition questions for the given entries.
 * Duplicate ids can never occur because the id is derived from
 * `entry.id` + question type, and each pair is visited at most once.
 */
export function generateQuestions(
  entries: VocabularyEntry[],
  options: { rng: Rng; types?: QuestionType[]; pool?: VocabularyEntry[] },
): QuizQuestion[] {
  const types = (options.types ?? GENERATED_TYPES).filter(isGeneratedType);
  if (types.length === 0) return [];

  const pool = options.pool ?? entries;
  const generated: QuizQuestion[] = [];
  const index = indexDistractors(pool);

  for (const entry of entries) {
    const candidates = candidateDistractors(entry, index);
    for (const type of types) {
      const question = generateForEntry(entry, type, { rng: options.rng, candidates });
      if (question) generated.push(question);
    }
  }
  return generated;
}
