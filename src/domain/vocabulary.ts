import { z } from 'zod';

/**
 * Vocabulary domain model.
 *
 * The Zod schemas below are the single source of truth: the TypeScript types
 * are inferred from them so that runtime validation and compile-time types can
 * never drift apart. `scripts/validate-vocabulary.ts` validates every JSON file
 * in `src/data/vocabulary` against these schemas at build time.
 */

export const cefrLevels = ['B2', 'C1', 'C2'] as const;
export const cefrLevelSchema = z.enum(cefrLevels);
export type CefrLevel = z.infer<typeof cefrLevelSchema>;

export const partsOfSpeech = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'phrase',
  'other',
] as const;
export const partOfSpeechSchema = z.enum(partsOfSpeech);
export type PartOfSpeech = z.infer<typeof partOfSpeechSchema>;

export const registers = [
  'formal',
  'informal',
  'neutral',
  'academic',
  'business',
  'technical',
  'literary',
  'spoken',
] as const;
export const registerSchema = z.enum(registers);
export type Register = z.infer<typeof registerSchema>;

/** Traditional Chinese labels used across the UI. */
export const partOfSpeechLabelZh: Record<PartOfSpeech, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  preposition: '介系詞',
  conjunction: '連接詞',
  phrase: '片語',
  other: '其他',
};

export const registerLabelZh: Record<Register, string> = {
  formal: '正式',
  informal: '非正式',
  neutral: '中性',
  academic: '學術',
  business: '商務',
  technical: '技術',
  literary: '文學',
  spoken: '口語',
};

const nonEmpty = (label: string) => z.string().trim().min(1, `${label} must not be empty`);

export const exampleSentenceSchema = z.object({
  en: nonEmpty('example.en'),
  zh: nonEmpty('example.zh'),
  /** Substring of `en` to visually emphasise. Must actually occur in `en`. */
  highlight: z.string().trim().min(1).optional(),
});
export type ExampleSentence = z.infer<typeof exampleSentenceSchema>;

export const relatedWordSchema = z.object({
  /** Optional link to another entry in the corpus. Validated for existence. */
  wordId: z.string().trim().min(1).optional(),
  lemma: nonEmpty('relatedWord.lemma'),
  noteZh: z.string().trim().min(1).optional(),
});
export type RelatedWord = z.infer<typeof relatedWordSchema>;

export const collocationSchema = z.object({
  text: nonEmpty('collocation.text'),
  meaningZh: z.string().trim().min(1).optional(),
  example: exampleSentenceSchema.optional(),
});
export type Collocation = z.infer<typeof collocationSchema>;

export const commonMistakeSchema = z.object({
  incorrect: z.string().trim().min(1).optional(),
  correct: z.string().trim().min(1).optional(),
  explanationZh: nonEmpty('commonMistake.explanationZh'),
});
export type CommonMistake = z.infer<typeof commonMistakeSchema>;

export const wordFamilyItemSchema = z.object({
  lemma: nonEmpty('wordFamily.lemma'),
  partOfSpeech: partOfSpeechSchema,
  meaningZh: z.string().trim().min(1).optional(),
});
export type WordFamilyItem = z.infer<typeof wordFamilyItemSchema>;

export const confusedWordSchema = z.object({
  lemma: nonEmpty('confusedWord.lemma'),
  wordId: z.string().trim().min(1).optional(),
  distinctionZh: nonEmpty('confusedWord.distinctionZh'),
});
export type ConfusedWord = z.infer<typeof confusedWordSchema>;

export const vocabularySenseSchema = z.object({
  id: nonEmpty('sense.id'),
  partOfSpeech: partOfSpeechSchema,
  register: z.array(registerSchema).nonempty().optional(),
  definitionEn: nonEmpty('sense.definitionEn'),
  definitionZh: nonEmpty('sense.definitionZh'),
  usageExplanationZh: nonEmpty('sense.usageExplanationZh'),
  grammarPatterns: z.array(nonEmpty('grammarPattern')).optional(),
  collocations: z.array(collocationSchema).optional(),
  examples: z.array(exampleSentenceSchema).min(1, 'sense must have at least one example'),
  usageNotes: z.array(nonEmpty('usageNote')).optional(),
  commonMistakes: z.array(commonMistakeSchema).optional(),
});
export type VocabularySense = z.infer<typeof vocabularySenseSchema>;

/**
 * Pronunciation is intentionally an object rather than a bare string so that
 * IPA / UK / audio variants can be added later without a data migration.
 * Only KK (American English, Kenyon & Knott) is required today.
 */
export const pronunciationSchema = z.object({
  kk: nonEmpty('pronunciation.kk'),
  syllables: z.string().trim().min(1).optional(),
  stressNote: z.string().trim().min(1).optional(),
});
export type Pronunciation = z.infer<typeof pronunciationSchema>;

export const wordFormsSchema = z.object({
  plural: z.string().trim().min(1).optional(),
  past: z.string().trim().min(1).optional(),
  pastParticiple: z.string().trim().min(1).optional(),
  presentParticiple: z.string().trim().min(1).optional(),
  thirdPersonSingular: z.string().trim().min(1).optional(),
  comparative: z.string().trim().min(1).optional(),
  superlative: z.string().trim().min(1).optional(),
});
export type WordForms = z.infer<typeof wordFormsSchema>;

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');

export const vocabularyEntrySchema = z.object({
  id: z
    .string()
    .regex(/^w_[a-z0-9_]+$/, 'id must look like "w_consolidate"'),
  lemma: nonEmpty('lemma'),
  slug: slugSchema,
  cefr: cefrLevelSchema,
  pronunciation: pronunciationSchema,
  forms: wordFormsSchema.optional(),
  senses: z.array(vocabularySenseSchema).min(1, 'entry must have at least one sense'),
  synonyms: z.array(relatedWordSchema).optional(),
  antonyms: z.array(relatedWordSchema).optional(),
  commonlyConfusedWith: z.array(confusedWordSchema).optional(),
  wordFamily: z.array(wordFamilyItemSchema).optional(),
  tags: z.array(nonEmpty('tag')),
});
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>;

/** Convenience accessors used by the UI and by question generation. */
export function primaryPartsOfSpeech(entry: VocabularyEntry): PartOfSpeech[] {
  return [...new Set(entry.senses.map((sense) => sense.partOfSpeech))];
}

export function primarySense(entry: VocabularyEntry): VocabularySense {
  // `senses` is guaranteed non-empty by the schema.
  return entry.senses[0] as VocabularySense;
}

/** Short Traditional Chinese gloss suitable for list rows and quiz options. */
export function shortMeaningZh(entry: VocabularyEntry): string {
  return primarySense(entry).definitionZh;
}

export function allCollocations(entry: VocabularyEntry): Collocation[] {
  return entry.senses.flatMap((sense) => sense.collocations ?? []);
}

export function allGrammarPatterns(entry: VocabularyEntry): string[] {
  return [...new Set(entry.senses.flatMap((sense) => sense.grammarPatterns ?? []))];
}

export function allExamples(entry: VocabularyEntry): ExampleSentence[] {
  return entry.senses.flatMap((sense) => sense.examples);
}
