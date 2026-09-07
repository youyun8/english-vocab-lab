import { z } from 'zod';

/**
 * The question type vocabulary, kept in its own module because both the quiz
 * domain and the vocabulary index need it: the index records which generated
 * types each word supports, and importing `quiz.ts` from `vocabulary.ts` would
 * be a cycle.
 */

export const questionTypes = [
  'meaning_en_to_zh',
  'meaning_zh_to_en',
  'definition_to_word',
  'cloze',
  'usage',
  'collocation',
  'grammar',
  'confusing_words',
] as const;
export const questionTypeSchema = z.enum(questionTypes);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/**
 * The types a generator can produce from vocabulary data alone. Everything
 * else depends on nuance and stays hand written.
 */
export const generatedQuestionTypes = [
  'meaning_en_to_zh',
  'meaning_zh_to_en',
  'definition_to_word',
] as const;
export const generatedQuestionTypeSchema = z.enum(generatedQuestionTypes);
export type GeneratedQuestionType = z.infer<typeof generatedQuestionTypeSchema>;
