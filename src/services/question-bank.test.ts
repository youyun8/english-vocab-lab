import { describe, expect, it } from 'vitest';

import { loadCuratedQuestions, loadVocabulary } from '@/data';
import {
  DEFAULT_QUESTION_BANK_FILTERS,
  buildQuestionBank,
  collectQuestionTags,
  filterQuestionBank,
  summarizeQuestionBank,
  type QuestionBankFilters,
} from './question-bank';

const entries = await loadVocabulary();
const curated = await loadCuratedQuestions();
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const bank = buildQuestionBank(entries, curated);

const filter = (patch: Partial<QuestionBankFilters>) =>
  filterQuestionBank(bank, { ...DEFAULT_QUESTION_BANK_FILTERS, ...patch }, byId);

describe('buildQuestionBank', () => {
  it('keeps every curated question', () => {
    const ids = new Set(bank.map((question) => question.id));
    for (const question of curated) {
      expect(ids.has(question.id), question.id).toBe(true);
    }
  });

  it('exercises every word in the shipped vocabulary', () => {
    expect(summarizeQuestionBank(bank).coveredWords).toBe(entries.length);
  });

  it('is far larger than the curated files alone', () => {
    const summary = summarizeQuestionBank(bank);
    expect(summary.curated).toBe(curated.length);
    expect(summary.generated).toBeGreaterThan(entries.length * 2);
    expect(summary.total).toBe(summary.curated + summary.generated);
  });

  it('has no duplicate question ids', () => {
    const ids = bank.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic, so options never reshuffle between renders', () => {
    const rebuilt = buildQuestionBank(entries, curated);
    expect(rebuilt).toEqual(bank);
  });

  it('groups a word\'s questions together, curated first', () => {
    // Grouping follows the primary word; a question may also cite others.
    const positions = bank
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => question.wordIds[0] === 'w_eliminate');
    const indexes = positions.map((item) => item.index);
    expect(indexes.length).toBeGreaterThan(1);
    expect(Math.max(...indexes) - Math.min(...indexes)).toBe(indexes.length - 1);
    expect(positions[0]?.question.source).toBe('curated');
  });
});

describe('filterQuestionBank', () => {
  it('returns everything when no filter is set', () => {
    expect(filter({})).toHaveLength(bank.length);
  });

  it('filters by question type', () => {
    const results = filter({ types: ['definition_to_word'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((question) => question.type === 'definition_to_word')).toBe(true);
  });

  it('filters by CEFR level, difficulty and source', () => {
    expect(filter({ levels: ['C2'] }).every((question) => question.cefr === 'C2')).toBe(true);
    expect(filter({ difficulties: [3] }).every((question) => question.difficulty === 3)).toBe(true);

    const curatedOnly = filter({ sources: ['curated'] });
    expect(curatedOnly).toHaveLength(curated.length);
    expect(curatedOnly.every((question) => question.source === 'curated')).toBe(true);
  });

  it('filters by tag', () => {
    const tags = collectQuestionTags(bank);
    expect(tags).toContain('generated');
    expect(filter({ tag: 'generated' }).every((q) => q.tags.includes('generated'))).toBe(true);
  });

  it('searches the headword, the prompt and the options', () => {
    const results = filter({ query: 'eliminate' });
    expect(results.length).toBeGreaterThan(0);
    for (const question of results) {
      const haystack = [
        question.prompt,
        question.context ?? '',
        ...question.options.map((option) => option.text),
        ...question.wordIds.map((id) => byId.get(id)?.lemma ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      expect(haystack, question.id).toContain('eliminate');
    }
  });

  it('combines filters', () => {
    const results = filter({ types: ['meaning_en_to_zh'], levels: ['B2'], sources: ['generated'] });
    expect(results.length).toBeGreaterThan(0);
    for (const question of results) {
      expect(question.type).toBe('meaning_en_to_zh');
      expect(question.cefr).toBe('B2');
      expect(question.source).toBe('generated');
    }
  });
});
