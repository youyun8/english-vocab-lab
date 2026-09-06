import { describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { quizQuestionSchema, OPTIONS_PER_QUESTION } from '@/domain/quiz';
import { shortMeaningZh, type VocabularyEntry } from '@/domain/vocabulary';
import { createRng } from '@/utils/random';
import { GENERATED_TYPES, generateQuestions } from './question-generator';

const entries = await loadVocabulary();
const rng = () => createRng(42);

describe('generateQuestions', () => {
  it('produces one question per entry per requested type', () => {
    const sample = entries.slice(0, 10);
    const generated = generateQuestions(sample, { rng: rng(), pool: entries });
    expect(generated).toHaveLength(sample.length * GENERATED_TYPES.length);
  });

  it('provides recognition practice for every imported word', () => {
    const imported = entries.filter((entry) => entry.dictionarySource);
    const generated = generateQuestions(imported, { rng: rng(), pool: entries });
    expect(generated).toHaveLength(imported.length * GENERATED_TYPES.length);
  });

  it('excludes partial gloss overlap, secondary senses, and reverse synonym links', () => {
    const base = entries[0]!;
    const word = (lemma: string, gloss: string): VocabularyEntry => ({
      ...base, id: `w_${lemma}`, lemma, slug: lemma, synonyms: [],
      senses: [{ ...base.senses[0]!, definitionEn: `Definition for ${lemma}`, definitionZh: gloss }],
    });
    const target = word('target', '減少；緩和');
    const overlap = word('overlap', '減少；縮小');
    const secondary = word('secondary', '消失');
    secondary.senses.push({ ...secondary.senses[0]!, definitionZh: '緩和' });
    const reverse = { ...word('reverse', '削弱'), synonyms: [{ lemma: 'target' }] };
    const distinct = [word('first', '增加'), word('second', '支持'), word('third', '預測')];
    const generated = generateQuestions([target], { rng: rng(), pool: [target, overlap, secondary, reverse, ...distinct] });
    expect(generated).toHaveLength(2);
    for (const question of generated) {
      const texts = question.options.map((option) => option.text);
      for (const excluded of [overlap, secondary, reverse]) {
        expect(texts).not.toContain(excluded.lemma);
        expect(texts).not.toContain(shortMeaningZh(excluded));
      }
    }
  });

  it('only generates the two simple recognition types' , () => {
    const generated = generateQuestions(entries.slice(0, 5), { rng: rng(), pool: entries });
    for (const question of generated) {
      expect(GENERATED_TYPES).toContain(question.type);
    }
  });

  it('refuses to generate the nuanced types even when asked', () => {
    const generated = generateQuestions(entries.slice(0, 5), {
      rng: rng(),
      pool: entries,
      types: ['usage', 'collocation', 'grammar', 'confusing_words'],
    });
    expect(generated).toEqual([]);
  });

  it('emits questions that satisfy the quiz schema', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const result = quizQuestionSchema.safeParse(question);
      expect(result.success, `${question.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('never produces duplicate question ids', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const ids = generated.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never produces duplicate option text within a question', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const texts = question.options.map((option) => option.text.trim().toLowerCase());
      expect(new Set(texts).size, question.id).toBe(OPTIONS_PER_QUESTION);
    }
  });

  it('always includes the correct answer among the options', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const ids = question.options.map((option) => option.id);
      expect(ids, question.id).toContain(question.correctOptionId);
    }
  });

  it('never uses a declared synonym as a distractor (ambiguity protection)', () => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });

    for (const question of generated) {
      const target = byId.get(question.wordIds[0]!)!;
      const synonymLemmas = new Set(
        (target.synonyms ?? []).map((related) => related.lemma.toLowerCase()),
      );
      const synonymGlosses = new Set(
        entries
          .filter((entry) => synonymLemmas.has(entry.lemma.toLowerCase()))
          .map((entry) => shortMeaningZh(entry)),
      );

      for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        expect(synonymLemmas.has(option.text.toLowerCase()), question.id).toBe(false);
        expect(synonymGlosses.has(option.text), question.id).toBe(false);
      }
    }
  });

  it('never uses a distractor whose gloss equals the correct answer', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const correct = question.options.find((o) => o.id === question.correctOptionId)!;
      const others = question.options.filter((o) => o.id !== question.correctOptionId);
      for (const other of others) {
        expect(other.text, question.id).not.toBe(correct.text);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const first = generateQuestions(entries.slice(0, 8), { rng: createRng(7), pool: entries });
    const second = generateQuestions(entries.slice(0, 8), { rng: createRng(7), pool: entries });
    expect(first).toEqual(second);
  });

  it('returns nothing when the pool is too small to build distractors', () => {
    const tiny = entries.slice(0, 2);
    const generated = generateQuestions(tiny, { rng: rng(), pool: tiny });
    expect(generated).toEqual([]);
  });

  it('marks generated questions with source "generated"', () => {
    const generated = generateQuestions(entries.slice(0, 3), { rng: rng(), pool: entries });
    for (const question of generated) {
      expect(question.source).toBe('generated');
    }
  });
});
