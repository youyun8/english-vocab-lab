import { z } from 'zod';

import { generatedQuestionTypeSchema, type GeneratedQuestionType } from './question-types';

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

/**
 * Every word page is laid out to one spec, so `register` and `grammarPatterns`
 * are required rather than optional: a sense that cannot say how it is used or
 * at what level of formality is not finished, and a page that silently omits
 * those sections reads differently from every other page in the corpus.
 * `collocations`, `usageNotes` and `wordFamily` stay optional because a word can
 * genuinely have none — inventing them would teach English that does not exist.
 */
export const vocabularySenseSchema = z.object({
  id: nonEmpty('sense.id'),
  partOfSpeech: partOfSpeechSchema,
  register: z.array(registerSchema).nonempty(),
  definitionEn: nonEmpty('sense.definitionEn'),
  definitionZh: nonEmpty('sense.definitionZh'),
  usageExplanationZh: nonEmpty('sense.usageExplanationZh').optional(),
  grammarPatterns: z.array(nonEmpty('grammarPattern')).nonempty(),
  collocations: z.array(collocationSchema).optional(),
  examples: z.array(exampleSentenceSchema),
  usageNotes: z.array(nonEmpty('usageNote')).optional(),
});
export type VocabularySense = z.infer<typeof vocabularySenseSchema>;

/**
 * A sense fresh out of the source dictionary, before anyone has decided how the
 * word is actually used. The import scripts work in this shape; nothing in the
 * app does, because `vocabularyEntrySchema` is what a chunk file has to satisfy
 * before it ships, and that still demands the authored fields.
 */
export const draftVocabularySenseSchema = vocabularySenseSchema.omit({
  register: true,
  grammarPatterns: true,
});
export type DraftVocabularySense = z.infer<typeof draftVocabularySenseSchema>;

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

/**
 * The entry's fields, before the cross-field rule below is attached. Kept
 * separate only so the draft schema can swap `senses` out: a refined schema
 * cannot be extended, and duplicating the field list would let the two drift.
 */
const vocabularyEntryFields = z.object({
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
  /** Individually edited bilingual senses; does not assert review by a human. */
  contentRevision: z.literal('bilingual-v1').optional(),
  /** Dictionary entries support recognition; curated lessons retain richer requirements. */
  dictionarySource: z.object({
    name: z.literal('ECDICT'),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    license: z.literal('MIT'),
    cefrEstimated: z.literal(true),
  }).optional(),
});

/** An edited entry owes every sense usage guidance and a translated example. */
function checkCuratedSenses(
  entry: { dictionarySource?: unknown; contentRevision?: unknown; senses: VocabularySense[] | DraftVocabularySense[] },
  ctx: z.RefinementCtx,
) {
  if (entry.dictionarySource && !entry.contentRevision) return;
  entry.senses.forEach((sense, index) => {
    if (!sense.usageExplanationZh) {
      ctx.addIssue({ code: 'custom', path: ['senses', index, 'usageExplanationZh'], message: 'curated senses require usage guidance' });
    }
    if (sense.examples.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['senses', index, 'examples'], message: 'curated senses require a translated example' });
    }
  });
}

export const vocabularyEntrySchema = vocabularyEntryFields.superRefine(checkCuratedSenses);
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>;

/**
 * An imported entry whose senses have not been authored yet. It is held to the
 * same cross-field rule as a finished entry; only `register` and
 * `grammarPatterns` are still outstanding.
 */
export const draftVocabularyEntrySchema = vocabularyEntryFields
  .extend({ senses: z.array(draftVocabularySenseSchema).min(1, 'entry must have at least one sense') })
  .superRefine(checkCuratedSenses);
export type DraftVocabularyEntry = z.infer<typeof draftVocabularyEntrySchema>;

/**
 * The list-level projection of an entry.
 *
 * Everything the word bank, the dashboard, review, statistics and in-app links
 * need to render a word — but not the examples, collocations or usage notes
 * that make a full entry large. The whole corpus ships as one index of these,
 * so browsing thousands of words costs one small download; the full entry is
 * fetched only for the word actually opened. The deeper searchable prose lives
 * in its own file (see `searchTextOf`), fetched only when a query is typed.
 */
export const vocabularySummarySchema = z.object({
  id: z.string().min(1),
  lemma: z.string().min(1),
  slug: slugSchema,
  cefr: cefrLevelSchema,
  kk: z.string().min(1),
  partsOfSpeech: z.array(partOfSpeechSchema).nonempty(),
  meaningZh: z.string().min(1),
  tags: z.array(z.string().min(1)),
  /** Data file holding the full entry, e.g. "exam/exam-07". */
  chunk: z.string().min(1),
  /** True for entries with dictionary provenance, including edited lessons. */
  dictionary: z.boolean(),
  /**
   * Recognition question types this word can produce, recorded at build time so
   * the question bank can count and order its questions without generating any.
   */
  generatedTypes: z.array(generatedQuestionTypeSchema),
});
export type VocabularySummary = z.infer<typeof vocabularySummarySchema>;

/**
 * Projects a full entry down to its index record. `generatedTypes` is supplied
 * by the caller because deciding it belongs to question generation, not here.
 */
export function summarize(
  entry: VocabularyEntry,
  chunk: string,
  generatedTypes: GeneratedQuestionType[] = [],
): VocabularySummary {
  return {
    id: entry.id,
    lemma: entry.lemma,
    slug: entry.slug,
    cefr: entry.cefr,
    kk: entry.pronunciation.kk,
    partsOfSpeech: primaryPartsOfSpeech(entry) as [PartOfSpeech, ...PartOfSpeech[]],
    meaningZh: shortMeaningZh(entry),
    tags: entry.tags,
    chunk,
    dictionary: entry.dictionarySource != null,
    generatedTypes,
  };
}

/**
 * The searchable prose an index row leaves out: everything except the headword
 * and the primary gloss, which search already has from the index.
 */
export function searchTextOf(entry: VocabularyEntry): string {
  const [primary, ...otherSenses] = entry.senses;
  const searchParts = [
    // The primary gloss is already in `meaningZh`; only the rest is stored.
    primary?.definitionEn ?? '',
    ...(primary?.usageExplanationZh ? [primary.usageExplanationZh] : []),
    ...(primary?.grammarPatterns ?? []),
    ...(primary?.collocations ?? []).map((item) => `${item.text} ${item.meaningZh ?? ''}`),
    ...otherSenses.flatMap((sense) => [
      sense.definitionZh,
      sense.definitionEn,
      sense.usageExplanationZh ?? '',
      ...(sense.grammarPatterns ?? []),
      ...(sense.collocations ?? []).map((item) => `${item.text} ${item.meaningZh ?? ''}`),
    ]),
    ...[...(entry.synonyms ?? []), ...(entry.antonyms ?? [])].map((item) => item.lemma),
    ...(entry.wordFamily ?? []).map((item) => item.lemma),
    ...(entry.commonlyConfusedWith ?? []).map((item) => item.lemma),
  ];

  return searchParts.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

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
