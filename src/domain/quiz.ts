import { z } from 'zod';

import { cefrLevelSchema, type CefrLevel } from './vocabulary';

/**
 * Quiz domain model.
 *
 * Correctness is encoded by `correctOptionId` and never by array position, so
 * options can be shuffled freely without corrupting the answer key.
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

export const questionTypeLabelZh: Record<QuestionType, string> = {
  meaning_en_to_zh: '英譯中',
  meaning_zh_to_en: '中譯英',
  definition_to_word: '英文釋義',
  cloze: '克漏字',
  usage: '用法判斷',
  collocation: '搭配詞',
  grammar: '文法句型',
  confusing_words: '易混淆字',
};

export const difficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const quizOptionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
});
export type QuizOption = z.infer<typeof quizOptionSchema>;

export const OPTIONS_PER_QUESTION = 4;

export const quizQuestionSchema = z
  .object({
    id: z.string().regex(/^q_[a-z0-9_]+$/, 'id must look like "q_consolidate_01"'),
    type: questionTypeSchema,
    cefr: cefrLevelSchema,
    /** Vocabulary entries this question exercises. Validated for existence. */
    wordIds: z.array(z.string().trim().min(1)).min(1),
    prompt: z.string().trim().min(1),
    /** Optional sentence / scenario shown above the options. */
    context: z.string().trim().min(1).optional(),
    options: z.array(quizOptionSchema).length(OPTIONS_PER_QUESTION),
    correctOptionId: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    distractorExplanations: z.record(z.string(), z.string().trim().min(1)).optional(),
    difficulty: difficultySchema,
    tags: z.array(z.string().trim().min(1)),
    /**
     * `curated` questions are hand-written and version controlled.
     * `generated` questions are derived from vocabulary data at runtime.
     */
    source: z.enum(['curated', 'generated']).default('curated'),
  })
  .superRefine((question, ctx) => {
    const ids = question.options.map((option) => option.id);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'option ids must be unique', path: ['options'] });
    }

    const texts = question.options.map((option) => option.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({ code: 'custom', message: 'option texts must be unique', path: ['options'] });
    }

    if (!uniqueIds.has(question.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        message: `correctOptionId "${question.correctOptionId}" is not present in options`,
        path: ['correctOptionId'],
      });
    }

    for (const key of Object.keys(question.distractorExplanations ?? {})) {
      if (!uniqueIds.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `distractorExplanations key "${key}" is not an option id`,
          path: ['distractorExplanations', key],
        });
      }
      if (key === question.correctOptionId) {
        ctx.addIssue({
          code: 'custom',
          message: 'distractorExplanations must not describe the correct option',
          path: ['distractorExplanations', key],
        });
      }
    }
  });
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizModes = [
  'random',
  'weak',
  'mistakes',
  'due',
  'bookmarked',
  'difficult',
] as const;
export const quizModeSchema = z.enum(quizModes);
export type QuizMode = z.infer<typeof quizModeSchema>;

export const quizModeLabelZh: Record<QuizMode, string> = {
  random: '隨機出題',
  weak: '弱點單字',
  mistakes: '錯題複習',
  due: '到期複習',
  bookmarked: '收藏單字',
  difficult: '困難單字',
};

export const quizConfigSchema = z.object({
  questionCount: z.number().int().min(1).max(50),
  cefrLevels: z.array(cefrLevelSchema).nonempty(),
  questionTypes: z.array(questionTypeSchema).nonempty(),
  mode: quizModeSchema,
  shuffleOptions: z.boolean(),
});
export type QuizConfig = z.infer<typeof quizConfigSchema>;

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  questionCount: 10,
  cefrLevels: ['B2', 'C1', 'C2'],
  questionTypes: [...questionTypes],
  mode: 'random',
  shuffleOptions: true,
};

/** A single answered question inside an in-progress session. */
export interface QuizAnswerRecord {
  questionId: string;
  selectedOptionId: string;
  correct: boolean;
  answeredAt: string;
  wordIds: string[];
  type: QuestionType;
  cefr: CefrLevel;
}

export interface QuizSession {
  id: string;
  config: QuizConfig;
  questions: QuizQuestion[];
  answers: QuizAnswerRecord[];
  startedAt: string;
  completedAt?: string;
}

export function isCorrectAnswer(question: QuizQuestion, selectedOptionId: string): boolean {
  return question.correctOptionId === selectedOptionId;
}

export function findOption(question: QuizQuestion, optionId: string): QuizOption | null {
  return question.options.find((option) => option.id === optionId) ?? null;
}
