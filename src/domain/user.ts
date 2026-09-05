import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  githubId: z.number().int(),
  githubLogin: z.string(),
  githubName: z.string().optional(),
  githubAvatarUrl: z.string().url().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

/** Shape returned by `GET /api/auth/me`. */
export const authStateSchema = z.object({
  authenticated: z.boolean(),
  user: userSchema.nullable(),
});
export type AuthState = z.infer<typeof authStateSchema>;
