import { quizQuestionSchema, type QuizQuestion } from '@/domain/quiz';
import { vocabularyEntrySchema, type VocabularyEntry } from '@/domain/vocabulary';

/**
 * Static content loader.
 *
 * Vocabulary and curated questions live as JSON in the repository so that they
 * get git history, code review and build-time validation.
 *
 * The globs below are intentionally *lazy*: Vite emits each JSON file as its
 * own chunk, fetched in parallel on first use rather than inlined into the main
 * bundle. That is what lets the corpus grow from 60 entries to several thousand
 * without the initial download growing with it — adding a file needs no code
 * change anywhere.
 */

const vocabularyModules = import.meta.glob<{ default: unknown }>('./vocabulary/**/*.json');
const questionModules = import.meta.glob<{ default: unknown }>('./questions/*.json');

type ModuleMap = Record<string, () => Promise<{ default: unknown }>>;

async function loadAll<T>(
  modules: ModuleMap,
  parse: (raw: unknown) => { success: true; data: T } | { success: false; error: unknown },
  label: string,
): Promise<T[]> {
  // Sorted so that ordering is deterministic regardless of module resolution.
  const files = Object.keys(modules).sort((a, b) => a.localeCompare(b));

  const loaded = await Promise.all(
    files.map(async (file) => {
      const loader = modules[file];
      if (!loader) throw new Error(`Missing loader for ${file}`);
      const mod = await loader();
      if (!Array.isArray(mod.default)) {
        throw new Error(`Data file ${file} must export a JSON array`);
      }
      return { file, items: mod.default as unknown[] };
    }),
  );

  const results: T[] = [];
  for (const { file, items } of loaded) {
    for (const raw of items) {
      const parsed = parse(raw);
      if (!parsed.success) {
        throw new Error(`Invalid ${label} in ${file}: ${JSON.stringify(parsed.error, null, 2)}`);
      }
      results.push(parsed.data);
    }
  }
  return results;
}

// The promise itself is cached, so concurrent callers share one download.
let vocabularyPromise: Promise<VocabularyEntry[]> | null = null;
let questionPromise: Promise<QuizQuestion[]> | null = null;

/** All vocabulary entries, validated once and cached for the session. */
export function loadVocabulary(): Promise<VocabularyEntry[]> {
  vocabularyPromise ??= loadAll(
    vocabularyModules,
    (raw) => vocabularyEntrySchema.safeParse(raw),
    'vocabulary entry',
  );
  return vocabularyPromise;
}

/** All curated quiz questions, validated once and cached for the session. */
export function loadCuratedQuestions(): Promise<QuizQuestion[]> {
  questionPromise ??= loadAll(
    questionModules,
    (raw) => quizQuestionSchema.safeParse(raw),
    'quiz question',
  );
  return questionPromise;
}
