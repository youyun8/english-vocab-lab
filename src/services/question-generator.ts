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

/** Entries usable as distractors for `target`, with ambiguity filtered out. */
function candidateDistractors(
  target: VocabularyEntry,
  pool: VocabularyEntry[],
): VocabularyEntry[] {
  const targetGloss = shortMeaningZh(target).trim();
  const targetPos = primaryPos(target);

  // Words explicitly flagged as synonyms would make a second option defensible.
  const synonymLemmas = new Set(
    (target.synonyms ?? []).map((related) => related.lemma.toLowerCase()),
  );

  const samePos = pool.filter(
    (entry) =>
      entry.id !== target.id &&
      !synonymLemmas.has(entry.lemma.toLowerCase()) &&
      shortMeaningZh(entry).trim() !== targetGloss &&
      primaryPos(entry) === targetPos,
  );

  if (samePos.length >= DISTRACTOR_COUNT) return samePos;

  // Fall back to any part of speech rather than emitting a malformed question.
  return pool.filter(
    (entry) =>
      entry.id !== target.id &&
      !synonymLemmas.has(entry.lemma.toLowerCase()) &&
      shortMeaningZh(entry).trim() !== targetGloss,
  );
}

function buildOptions(texts: string[]): { id: string; text: string }[] {
  return texts.map((text, index) => ({ id: `o${index + 1}`, text }));
}

interface GenerateOptions {
  rng: Rng;
  pool: VocabularyEntry[];
}

function generateForEntry(
  entry: VocabularyEntry,
  type: 'meaning_en_to_zh' | 'meaning_zh_to_en',
  { rng, pool }: GenerateOptions,
): QuizQuestion | null {
  const candidates = candidateDistractors(entry, pool);
  if (candidates.length < DISTRACTOR_COUNT) return null;

  const distractors = shuffle(candidates, rng).slice(0, DISTRACTOR_COUNT);

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

  for (const entry of entries) {
    for (const type of types) {
      const question = generateForEntry(entry, type, { rng: options.rng, pool });
      if (question) generated.push(question);
    }
  }
  return generated;
}
