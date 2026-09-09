import { describe, expect, it } from 'vitest';

import { loadCuratedQuestions, loadVocabulary, loadVocabularyIndex } from '@/data';
import { createRng } from '@/utils/random';
import {
  DEFAULT_QUESTION_BANK_FILTERS,
  buildQuestionRefs,
  collectQuestionTags,
  filterQuestionRefs,
  materializeQuestions,
  pageWordIds,
  questionFacetCounts,
  summarizeQuestionBank,
  type QuestionBankFilters,
} from './question-bank';
import { generateQuestions } from './question-generator';

const summaries = await loadVocabularyIndex();
const curated = await loadCuratedQuestions();
const entries = await loadVocabulary();
const bank = buildQuestionRefs(summaries, curated);
const entriesById = new Map(entries.map((entry) => [entry.id, entry]));

const filter = (patch: Partial<QuestionBankFilters>) =>
  filterQuestionRefs(bank, { ...DEFAULT_QUESTION_BANK_FILTERS, ...patch });

describe('buildQuestionRefs', () => {
  it('keeps every curated question', () => {
    const ids = new Set(bank.map((ref) => ref.id));
    for (const question of curated) {
      expect(ids.has(question.id), question.id).toBe(true);
    }
  });

  it('exercises every word in the shipped vocabulary', () => {
    expect(summarizeQuestionBank(bank).coveredWords).toBe(summaries.length);
  });

  it('is far larger than the curated files alone', () => {
    const summary = summarizeQuestionBank(bank);
    expect(summary.curated).toBe(curated.length);
    expect(summary.generated).toBeGreaterThan(summaries.length * 2);
    expect(summary.total).toBe(summary.curated + summary.generated);
  });

  it('has no duplicate question ids', () => {
    const ids = bank.map((ref) => ref.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic, so the bank never reorders under the reader', () => {
    expect(buildQuestionRefs(summaries, curated)).toEqual(bank);
  });

  it("groups a word's questions together, curated first", () => {
    // Grouping follows the primary word; a question may also cite others.
    const positions = bank
      .map((ref, index) => ({ ref, index }))
      .filter(({ ref }) => ref.wordIds[0] === 'w_eliminate');
    const indexes = positions.map((item) => item.index);
    expect(indexes.length).toBeGreaterThan(1);
    expect(Math.max(...indexes) - Math.min(...indexes)).toBe(indexes.length - 1);
    expect(positions[0]?.ref.source).toBe('curated');
  });
});

// The page counts and orders questions from the index without building them.
// If that ever drifted from the generator, the bank would advertise questions
// it cannot show, so this compares the two directly over the whole corpus.
const generated = generateQuestions(entries, { rng: createRng(1), pool: entries });

describe('the index-derived bank matches what generation actually produces', () => {
  it('predicts exactly the generated questions the generator emits', () => {
    const predicted = new Set(
      bank.filter((ref) => ref.source === 'generated').map((ref) => ref.id),
    );
    const actual = new Set(generated.map((question) => question.id));
    expect(predicted.size).toBe(actual.size);
    for (const id of actual) expect(predicted.has(id), id).toBe(true);
  });

  it('predicts their type, level, difficulty and tags', () => {
    const byId = new Map(bank.map((ref) => [ref.id, ref]));
    for (const question of generated) {
      const ref = byId.get(question.id)!;
      expect(ref.type, question.id).toBe(question.type);
      expect(ref.cefr, question.id).toBe(question.cefr);
      expect(ref.difficulty, question.id).toBe(question.difficulty);
      expect(ref.tags, question.id).toEqual(question.tags);
    }
  });
});

describe('filterQuestionRefs', () => {
  it('returns everything when no filter is set', () => {
    expect(filter({})).toHaveLength(bank.length);
  });

  it('filters by question type', () => {
    const results = filter({ types: ['definition_to_word'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((ref) => ref.type === 'definition_to_word')).toBe(true);
  });

  it('filters by CEFR level, difficulty and source', () => {
    expect(filter({ levels: ['C2'] }).every((ref) => ref.cefr === 'C2')).toBe(true);
    expect(filter({ difficulties: [3] }).every((ref) => ref.difficulty === 3)).toBe(true);

    const curatedOnly = filter({ sources: ['curated'] });
    expect(curatedOnly).toHaveLength(curated.length);
    expect(curatedOnly.every((ref) => ref.source === 'curated')).toBe(true);
  });

  it('filters by tag', () => {
    const tags = collectQuestionTags(bank);
    expect(tags).toContain('generated');
    expect(filter({ tag: 'generated' }).every((ref) => ref.tags.includes('generated'))).toBe(true);
  });

  it('searches the headword and the gloss', () => {
    const results = filter({ query: 'eliminate' });
    expect(results.length).toBeGreaterThan(0);
    for (const ref of results) {
      expect(ref.searchable, ref.id).toContain('eliminate');
    }
  });

  it('combines filters', () => {
    const results = filter({ types: ['meaning_en_to_zh'], levels: ['B2'], sources: ['generated'] });
    expect(results.length).toBeGreaterThan(0);
    for (const ref of results) {
      expect(ref.type).toBe('meaning_en_to_zh');
      expect(ref.cefr).toBe('B2');
      expect(ref.source).toBe('generated');
    }
  });

  it('counts facets with each value\'s own group ignored', () => {
    const counts = questionFacetCounts(bank, {
      ...DEFAULT_QUESTION_BANK_FILTERS,
      types: ['cloze'],
    });
    // Picking another type as well would widen the result, so its count is not
    // reduced to zero by the cloze filter.
    expect(counts.types.get('usage')).toBe(
      bank.filter((ref) => ref.type === 'usage').length,
    );
    // No generated question is a cloze, so that source has no count at all.
    expect(counts.sources.get('generated') ?? 0).toBe(0);
    expect(counts.sources.get('curated')).toBeGreaterThan(0);
  });
});

describe('building one page', () => {
  const page = (start = 0, size = 20) => bank.slice(start, start + size);

  it('opens only a handful of data files for a page', () => {
    const byId = new Map(summaries.map((summary) => [summary.id, summary]));
    const { targetIds, poolIds } = pageWordIds(page(), summaries);
    const chunks = new Set([...targetIds, ...poolIds].map((id) => byId.get(id)?.chunk));
    expect(targetIds.length).toBeLessThanOrEqual(20);
    expect(chunks.size).toBeLessThanOrEqual(6);
  });

  it('builds exactly the questions the page references, in order', () => {
    const refs = page();
    const { targetIds, poolIds } = pageWordIds(refs, summaries);
    const targets = targetIds.map((id) => entriesById.get(id)!);
    const pool = poolIds.map((id) => entriesById.get(id)!);

    const questions = materializeQuestions(refs, targets, pool);
    expect(questions.map((question) => question.id)).toEqual(refs.map((ref) => ref.id));
    for (const [index, question] of questions.entries()) {
      expect(question.type).toBe(refs[index]!.type);
      expect(question.options).toHaveLength(4);
      expect(question.options.map((option) => option.id)).toContain(question.correctOptionId);
    }
  });

  it('gives a question the same options every time that page is built', () => {
    const refs = page(40);
    const { targetIds, poolIds } = pageWordIds(refs, summaries);
    const targets = targetIds.map((id) => entriesById.get(id)!);
    const pool = poolIds.map((id) => entriesById.get(id)!);

    expect(materializeQuestions(refs, targets, pool)).toEqual(
      materializeQuestions(refs, targets, pool),
    );
  });
});
