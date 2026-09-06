import {
  OPTIONS_PER_QUESTION,
  type QuizQuestion,
  type QuestionType,
} from '@/domain/quiz';
import { shortMeaningZh, type VocabularyEntry } from '@/domain/vocabulary';
import type { Rng } from '@/utils/random';
import { shuffle } from '@/utils/random';

/**
 * Generated questions.
 *
 * Only *simple recognition* questions are generated: English -> Chinese and
 * Chinese -> English. Anything that depends on nuance (usage, collocation,
 * grammar, confusing words) stays curated, because a generator cannot reliably
 * guarantee that exactly one option is defensible.
 *
 * Two safeguards keep generated questions fair:
 *  1. distractors are drawn from entries whose part of speech matches, so the
 *     answer can never be found by grammar alone;
 *  2. any entry whose gloss collides with the answer's gloss is rejected, so a
 *     question can never have two correct options.
 */

export const GENERATED_TYPES: QuestionType[] = ['meaning_en_to_zh', 'meaning_zh_to_en'];

const DISTRACTOR_COUNT = OPTIONS_PER_QUESTION - 1;

function primaryPos(entry: VocabularyEntry): string {
  return entry.senses[0]?.partOfSpeech ?? 'other';
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

/** Inverted gloss indexes avoid comparing every pair of definitions at corpus scale. */
function candidateDistractors(target: VocabularyEntry, index: DistractorIndex): VocabularyEntry[] {
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
  const eligible = (entries: VocabularyEntry[]) => entries.filter((entry) => !forbidden.has(entry.id));
  const samePos = eligible(index.byPos.get(primaryPos(target)) ?? []);
  return samePos.length >= DISTRACTOR_COUNT ? samePos : eligible(index.pool);
}

function buildOptions(texts: string[]): { id: string; text: string }[] {
  return texts.map((text, index) => ({ id: `o${index + 1}`, text }));
}

interface GenerateOptions {
  rng: Rng;
  candidates: VocabularyEntry[];
}

function generateForEntry(
  entry: VocabularyEntry,
  type: 'meaning_en_to_zh' | 'meaning_zh_to_en',
  { rng, candidates }: GenerateOptions,
): QuizQuestion | null {
  if (candidates.length < DISTRACTOR_COUNT) return null;

  const distractors: VocabularyEntry[] = [];
  const usedTexts = new Set<string>();
  for (const candidate of shuffle(candidates, rng)) {
    const text = (type === 'meaning_en_to_zh' ? shortMeaningZh(candidate) : candidate.lemma).trim().toLowerCase();
    if (usedTexts.has(text)) continue;
    usedTexts.add(text);
    distractors.push(candidate);
    if (distractors.length === DISTRACTOR_COUNT) break;
  }
  if (distractors.length < DISTRACTOR_COUNT) return null;

  const answerText =
    type === 'meaning_en_to_zh' ? shortMeaningZh(entry) : entry.lemma;
  const distractorTexts = distractors.map((d) =>
    type === 'meaning_en_to_zh' ? shortMeaningZh(d) : d.lemma,
  );

  const allTexts = [answerText, ...distractorTexts];
  // Defensive: never emit a question with duplicated option text.
  if (new Set(allTexts.map((t) => t.trim().toLowerCase())).size !== allTexts.length) {
    return null;
  }

  const ordered = shuffle(allTexts, rng);
  const options = buildOptions(ordered);
  const correct = options.find((option) => option.text === answerText);
  if (!correct) return null;

  const suffix = type === 'meaning_en_to_zh' ? 'e2z' : 'z2e';
  const slugId = entry.id.replace(/^w_/, '');

  return {
    id: `q_gen_${slugId}_${suffix}`,
    type,
    cefr: entry.cefr,
    wordIds: [entry.id],
    prompt:
      type === 'meaning_en_to_zh'
        ? `What does "${entry.lemma}" most nearly mean?`
        : `哪一個英文單字最接近「${shortMeaningZh(entry)}」？`,
    options,
    correctOptionId: correct.id,
    explanation:
      type === 'meaning_en_to_zh'
        ? `${entry.lemma}：${shortMeaningZh(entry)}。${entry.senses[0]?.definitionEn ?? ''}`
        : `「${shortMeaningZh(entry)}」對應的英文是 ${entry.lemma}（${entry.pronunciation.kk}）。`,
    difficulty: entry.cefr === 'B2' ? 1 : entry.cefr === 'C1' ? 2 : 3,
    tags: ['generated', 'meaning', ...entry.tags.slice(0, 2)],
    source: 'generated',
  };
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
  const types = (options.types ?? GENERATED_TYPES).filter((type): type is
    | 'meaning_en_to_zh'
    | 'meaning_zh_to_en' => GENERATED_TYPES.includes(type));
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
