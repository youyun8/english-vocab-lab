import { z } from 'zod';

import { learningStatusSchema, wordProgressSchema } from '@/domain/progress';
import { questionTypeSchema } from '@/domain/quiz';
import { userSettingsSchema } from '@/domain/settings';
import { cefrLevelSchema } from '@/domain/vocabulary';

/**
 * Wire contract shared by the Worker and the browser client.
 * Both sides import these schemas so a change can never desynchronise them.
 */

export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level validation detail. Never contains stack traces. */
    details?: Record<string, string[]>;
  };
}

export const API_ERROR_CODES = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  notFound: 'not_found',
  badRequest: 'bad_request',
  validationFailed: 'validation_failed',
  rateLimited: 'rate_limited',
  internal: 'internal_error',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** `PUT /api/progress/:wordId` */
export const progressUpdateSchema = z.object({
  status: learningStatusSchema.optional(),
  bookmarked: z.boolean().optional(),
  difficult: z.boolean().optional(),
  timesSeen: z.number().int().min(0).optional(),
  quizAttempts: z.number().int().min(0).optional(),
  correctAnswers: z.number().int().min(0).optional(),
  mistakeCount: z.number().int().min(0).optional(),
  reviewStreak: z.number().int().min(0).optional(),
  lastReviewedAt: z.string().optional(),
  nextReviewAt: z.string().optional(),
});
export type ProgressUpdate = z.infer<typeof progressUpdateSchema>;

/** `POST /api/progress/import-local` */
export const progressImportSchema = z.object({
  /**
   * Stable identifier for the local dataset being imported. The server records
   * it so the same anonymous session can never be merged twice.
   */
  importId: z.string().trim().min(8).max(128),
  progress: z.array(wordProgressSchema).max(20_000),
  settings: userSettingsSchema.optional(),
});
export type ProgressImport = z.infer<typeof progressImportSchema>;

export const progressImportResultSchema = z.object({
  imported: z.boolean(),
  alreadyImported: z.boolean(),
  merged: z.number().int().min(0),
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
});
export type ProgressImportResult = z.infer<typeof progressImportResultSchema>;

/** `POST /api/quiz` */
export const quizStartSchema = z.object({
  totalQuestions: z.number().int().min(1).max(50),
});
export type QuizStart = z.infer<typeof quizStartSchema>;

/** `POST /api/quiz/:quizId/answer` */
export const quizAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(128),
  wordId: z.string().trim().min(1).max(128).optional(),
  selectedOptionId: z.string().trim().min(1).max(128),
  correct: z.boolean(),
  questionType: questionTypeSchema.optional(),
  cefr: cefrLevelSchema.optional(),
});
export type QuizAnswerPayload = z.infer<typeof quizAnswerSchema>;

/** `POST /api/quiz/:quizId/complete` */
export const quizCompleteSchema = z.object({
  correctAnswers: z.number().int().min(0).max(50),
});
export type QuizComplete = z.infer<typeof quizCompleteSchema>;

export const quizAttemptSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  totalQuestions: z.number().int(),
  correctAnswers: z.number().int(),
});
export type QuizAttemptSummary = z.infer<typeof quizAttemptSchema>;

/** Server-side statistics payload. Word-level totals are added by the client, */
/** which is the side that owns the static vocabulary corpus. */
export const serverStatsSchema = z.object({
  quizzesCompleted: z.number().int().min(0),
  totalQuestionsAnswered: z.number().int().min(0),
  totalCorrectAnswers: z.number().int().min(0),
  accuracyByCefr: z.record(z.string(), z.object({ attempts: z.number(), correct: z.number() })),
  accuracyByQuestionType: z.record(
    z.string(),
    z.object({ attempts: z.number(), correct: z.number() }),
  ),
  recentActivity: z.array(
    z.object({ date: z.string(), answered: z.number(), correct: z.number() }),
  ),
});
export type ServerStats = z.infer<typeof serverStatsSchema>;

/** Portable JSON produced by Settings -> Export and consumed by Import. */
export const PROGRESS_EXPORT_VERSION = 1;

export const progressExportSchema = z.object({
  version: z.literal(PROGRESS_EXPORT_VERSION),
  exportedAt: z.string(),
  settings: userSettingsSchema,
  progress: z.array(wordProgressSchema),
});
export type ProgressExport = z.infer<typeof progressExportSchema>;
