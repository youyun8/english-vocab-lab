import {
  generatedQuestionTypes,
  quizQuestionSchema,
  type GeneratedQuestionType,
  type QuizQuestion,
} from '@/domain/quiz';
import {
  partOfSpeechSchema,
  vocabularyEntrySchema,
  vocabularySummarySchema,
  type PartOfSpeech,
  type VocabularyEntry,
  type VocabularySummary,
} from '@/domain/vocabulary';

/**
 * Static content loader.
 *
 * Vocabulary and curated questions live as JSON in the repository so that they
 * get git history, code review and build-time validation.
 *
 * Nothing here is eager. The app starts by loading one generated *index* of
 * every word — enough to browse, filter, sort and link — and fetches a word's
 * full entry only from the chunk that holds it. The deeper search text and the
 * curated question bank are separate downloads again, taken when a learner
 * actually searches or opens the quiz. That is what keeps a corpus of several
 * thousand words from being a multi-megabyte page load.
 */

const vocabularyModules = import.meta.glob<{ default: unknown }>('./vocabulary/**/*.json');
const questionModules = import.meta.glob<{ default: unknown }>('./questions/*.json');

type ModuleMap = Record<string, () => Promise<{ default: unknown }>>;

/** `exam/exam-07` -> `./vocabulary/exam/exam-07.json`, the glob's own key. */
function moduleKey(chunk: string): string {
  return `./vocabulary/${chunk}.json`;
}

async function loadJson(modules: ModuleMap, key: string, label: string): Promise<unknown[]> {
  const loader = modules[key];
  if (!loader) throw new Error(`Missing ${label} file ${key}`);
  const mod = await loader();
  if (!Array.isArray(mod.default)) throw new Error(`Data file ${key} must export a JSON array`);
  return mod.default;
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** Positional row, mirroring `INDEX_FIELDS` in `scripts/build-vocabulary-index.ts`. */
type IndexRow = [
  string, string, string, string, string, string, string, string, string, number, string,
];

function toSummary(row: IndexRow): VocabularySummary {
  const [id, lemma, slug, cefr, kk, pos, meaningZh, tags, chunk, dictionary, generated] = row;
  return vocabularySummarySchema.parse({
    id,
    lemma,
    slug,
    cefr,
    kk,
    partsOfSpeech: pos.split(',').filter(Boolean).map((value) =>
      partOfSpeechSchema.parse(value) as PartOfSpeech,
    ),
    meaningZh,
    tags: tags.split(' ').filter(Boolean),
    chunk,
    dictionary: dictionary === 1,
    // Positions into `generatedQuestionTypes`: the names repeat on every row,
    // and at corpus scale that is a quarter of the index.
    generatedTypes: [...generated]
      .map((code) => generatedQuestionTypes[Number(code)])
      .filter((type): type is GeneratedQuestionType => type != null),
  });
}

let indexPromise: Promise<VocabularySummary[]> | null = null;

/**
 * Every word, as index records, in alphabetical order. One request, cached for
 * the session; concurrent callers share it.
 */
export function loadVocabularyIndex(): Promise<VocabularySummary[]> {
  indexPromise ??= import('./vocabulary-index.json').then((mod) => {
    const file = mod.default as unknown as { rows: IndexRow[] };
    return file.rows.map(toSummary);
  });
  return indexPromise;
}

let searchTextPromise: Promise<Map<string, string>> | null = null;

/**
 * The searchable prose an index row omits, keyed by word id. Only fetched when
 * a learner actually types a query.
 */
export function loadSearchText(): Promise<Map<string, string>> {
  searchTextPromise ??= import('./vocabulary-search.json').then((mod) => {
    const file = mod.default as unknown as { rows: [string, string][] };
    return new Map(file.rows);
  });
  return searchTextPromise;
}

// ---------------------------------------------------------------------------
// Full entries
// ---------------------------------------------------------------------------

const chunkPromises = new Map<string, Promise<VocabularyEntry[]>>();

/** All entries in one data file, validated once and cached. */
export function loadChunk(chunk: string): Promise<VocabularyEntry[]> {
  const cached = chunkPromises.get(chunk);
  if (cached) return cached;

  const promise = loadJson(vocabularyModules, moduleKey(chunk), 'vocabulary').then((items) =>
    items.map((raw) => {
      const parsed = vocabularyEntrySchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Invalid vocabulary entry in ${chunk}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
      }
      return parsed.data;
    }),
  );
  chunkPromises.set(chunk, promise);
  return promise;
}

/**
 * Full entries for the given ids, fetching only the chunks that hold them.
 * Unknown ids are skipped; the caller decides what a missing word means.
 */
export async function loadEntriesByIds(ids: string[]): Promise<VocabularyEntry[]> {
  if (ids.length === 0) return [];
  const index = await loadVocabularyIndex();
  const byId = new Map(index.map((summary) => [summary.id, summary]));

  const wanted = new Set(ids);
  const chunks = new Set<string>();
  for (const id of wanted) {
    const summary = byId.get(id);
    if (summary) chunks.add(summary.chunk);
  }

  const loaded = await Promise.all([...chunks].sort().map((chunk) => loadChunk(chunk)));
  const found = new Map<string, VocabularyEntry>();
  for (const entry of loaded.flat()) {
    if (wanted.has(entry.id)) found.set(entry.id, entry);
  }
  // Preserve the caller's order, which is usually a ranking.
  return ids.map((id) => found.get(id)).filter((entry): entry is VocabularyEntry => entry != null);
}

let fullCorpusPromise: Promise<VocabularyEntry[]> | null = null;

/**
 * The whole corpus. Quiz assembly and the question bank genuinely need every
 * entry — they build questions across the corpus — so they pay for it
 * explicitly, behind their own loading state, rather than every page paying.
 */
export function loadVocabulary(): Promise<VocabularyEntry[]> {
  fullCorpusPromise ??= (async () => {
    const files = Object.keys(vocabularyModules).sort((a, b) => a.localeCompare(b));
    const chunks = files.map((file) => file.replace(/^\.\/vocabulary\//, '').replace(/\.json$/, ''));
    const loaded = await Promise.all(chunks.map((chunk) => loadChunk(chunk)));
    return loaded.flat();
  })();
  return fullCorpusPromise;
}

// ---------------------------------------------------------------------------
// Curated questions
// ---------------------------------------------------------------------------

let questionPromise: Promise<QuizQuestion[]> | null = null;

/** All curated quiz questions, validated once and cached for the session. */
export function loadCuratedQuestions(): Promise<QuizQuestion[]> {
  questionPromise ??= (async () => {
    const files = Object.keys(questionModules).sort((a, b) => a.localeCompare(b));
    const loaded = await Promise.all(
      files.map(async (file) => ({ file, items: await loadJson(questionModules, file, 'question') })),
    );

    const results: QuizQuestion[] = [];
    for (const { file, items } of loaded) {
      for (const raw of items) {
        const parsed = quizQuestionSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`Invalid quiz question in ${file}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
        }
        results.push(parsed.data);
      }
    }
    return results;
  })();
  return questionPromise;
}
