import { describe, expect, it } from 'vitest';

import {
  quizQuestionSchema,
  questionTypes,
  OPTIONS_PER_QUESTION,
  type QuestionType,
} from '@/domain/quiz';
import { vocabularyEntrySchema } from '@/domain/vocabulary';
import { GENERATED_TYPES } from '@/services/question-generator';
import { loadCuratedQuestions, loadVocabulary } from './index';

/**
 * These tests guard the shipped corpus itself. They complement
 * `scripts/validate-vocabulary.ts` by also asserting on quality properties that
 * are hard to express in a schema.
 */

const entries = await loadVocabulary();
const questions = await loadCuratedQuestions();
const curatedEntries = entries.filter((entry) => !entry.dictionarySource);
const dictionaryEntries = entries.filter((entry) => entry.dictionarySource);
/**
 * Recognition questions are generated from the corpus for every entry, so the
 * curated files only have to carry the types a generator cannot judge.
 */
const handWrittenTypes = questionTypes.filter(
  (type) => !(GENERATED_TYPES as QuestionType[]).includes(type),
);

describe('vocabulary corpus', () => {
  it('loads a non-trivial number of entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(2000);
  });

  it('keeps every CEFR band substantially represented', () => {
    for (const level of ['B2', 'C1', 'C2'] as const) {
      const count = entries.filter((entry) => entry.cefr === level).length;
      expect(count, `${level} is under-represented`).toBeGreaterThanOrEqual(20);
    }
  });

  it('every entry satisfies the schema', () => {
    for (const entry of entries) {
      expect(vocabularyEntrySchema.safeParse(entry).success, entry.id).toBe(true);
    }
  });

  it('has no duplicate ids or slugs', () => {
    const ids = entries.map((entry) => entry.id);
    const slugs = entries.map((entry) => entry.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has no duplicate sense ids across the whole corpus', () => {
    const senseIds = entries.flatMap((entry) => entry.senses.map((sense) => sense.id));
    expect(new Set(senseIds).size).toBe(senseIds.length);
  });

  it('covers all three CEFR levels', () => {
    const levels = new Set(entries.map((entry) => entry.cefr));
    expect([...levels].sort()).toEqual(['B2', 'C1', 'C2']);
  });

  it('gives every entry a slash-delimited KK transcription', () => {
    for (const entry of entries) {
      expect(entry.pronunciation.kk, entry.lemma).toMatch(/^\/.+\/$|\/.+\//);
    }
  });

  it('keeps translated examples on every curated sense', () => {
    for (const entry of curatedEntries) {
      for (const sense of entry.senses) {
        expect(sense.examples.length, `${entry.lemma}/${sense.id}`).toBeGreaterThan(0);
        for (const example of sense.examples) {
          expect(example.zh.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only highlights substrings that actually occur in the sentence', () => {
    for (const entry of entries) {
      for (const sense of entry.senses) {
        for (const example of sense.examples) {
          if (example.highlight) {
            expect(example.en, `${entry.lemma}: ${example.highlight}`).toContain(example.highlight);
          }
        }
      }
    }
  });

  it('resolves every cross-reference to a real entry', () => {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const entry of entries) {
      const links = [
        ...(entry.synonyms ?? []),
        ...(entry.antonyms ?? []),
        ...(entry.commonlyConfusedWith ?? []),
      ];
      for (const link of links) {
        if (link.wordId) {
          expect(ids.has(link.wordId), `${entry.id} -> ${link.wordId}`).toBe(true);
          expect(link.wordId).not.toBe(entry.id);
        }
      }
    }
  });

  it('gives almost every entry a confusing-word comparison', () => {
    // The comparison table is the corpus's flagship teaching feature; new
    // entries are expected to carry one unless the word has no near neighbour.
    const withComparison = curatedEntries.filter((entry) => entry.commonlyConfusedWith?.length);
    expect(withComparison.length / curatedEntries.length).toBeGreaterThanOrEqual(0.9);
  });

  it('gives a healthy share of entries usage notes or common mistakes', () => {
    const withGuidance = curatedEntries.filter((entry) =>
      entry.senses.some((sense) => sense.usageNotes?.length || sense.commonMistakes?.length),
    );
    expect(withGuidance.length / curatedEntries.length).toBeGreaterThanOrEqual(0.6);
  });

  it('writes usage explanations in Traditional Chinese, never Simplified', () => {
    // A small set of characters that are Simplified-only and would signal that
    // the wrong script slipped into the corpus.
    const simplifiedOnly = /[习实这个们说会电脑单词题这样对错还应该没关键]/;
    const alwaysAllowed = /^$/;

    for (const entry of entries) {
      for (const sense of entry.senses) {
        const text = (sense.usageExplanationZh ?? '') + sense.definitionZh;
        if (alwaysAllowed.test(text)) continue;
        expect(simplifiedOnly.test(text), `${entry.lemma}: ${text.slice(0, 40)}`).toBe(false);
      }
    }
  });
});

describe('dictionary expansion', () => {
  it('preserves the original detailed lessons and adds distinct exam headwords', () => {
    expect(curatedEntries.length).toBeGreaterThanOrEqual(120);
    expect(dictionaryEntries.length).toBeGreaterThanOrEqual(3880);
    expect(new Set(entries.map((entry) => entry.lemma.toLowerCase())).size).toBe(entries.length);
    for (const exam of ['toefl', 'gre', 'ielts']) {
      expect(dictionaryEntries.filter((entry) => entry.tags.includes(exam)).length).toBeGreaterThanOrEqual(1000);
    }
  });

  it('keeps source attribution and estimated levels on imported entries', () => {
    for (const entry of dictionaryEntries) {
      expect(entry.dictionarySource).toMatchObject({ name: 'ECDICT', license: 'MIT', cefrEstimated: true });
      expect(entry.tags.some((tag) => tag === 'toefl' || tag === 'gre' || tag === 'ielts')).toBe(true);
      for (const sense of entry.senses) {
        expect(sense.definitionEn).not.toMatch(/\\n|undefined|<[^>]*>/);
        expect(sense.definitionZh).toMatch(/[\u3400-\u9fff]/);
      }
    }
  });

  it('does not allow unattributed entries to omit lesson content', () => {
    const entry = dictionaryEntries[0]!;
    expect(vocabularyEntrySchema.safeParse({ ...entry, dictionarySource: undefined }).success).toBe(false);
  });
});

describe('curated question bank', () => {
  it('ships a substantial number of questions', () => {
    expect(questions.length).toBeGreaterThanOrEqual(170);
  });

  it('gives every hand-written question type meaningful coverage', () => {
    for (const type of handWrittenTypes) {
      const count = questions.filter((question) => question.type === type).length;
      expect(count, `${type} has too few questions`).toBeGreaterThanOrEqual(8);
    }
  });

  it('gives the imported exam corpus hand-written questions of every nuanced type', () => {
    // Generation can only produce recognition questions, so usage, collocation,
    // grammar, cloze and confusables for the exam words have to be written.
    const dictionaryIds = new Set(dictionaryEntries.map((entry) => entry.id));
    const examQuestions = questions.filter(
      (question) =>
        handWrittenTypes.includes(question.type) &&
        question.wordIds.some((id) => dictionaryIds.has(id)),
    );
    expect(examQuestions.length).toBeGreaterThanOrEqual(70);

    const covered = new Set(examQuestions.map((question) => question.type));
    for (const type of handWrittenTypes) {
      expect(covered.has(type), `exam vocabulary has no ${type} question`).toBe(true);
    }
  });

  it('covers every question type that cannot be generated', () => {
    const covered = new Set(questions.map((question) => question.type));
    for (const type of handWrittenTypes) {
      expect(covered.has(type), `missing questions of type ${type}`).toBe(true);
    }
  });

  it('every question satisfies the schema', () => {
    for (const question of questions) {
      expect(quizQuestionSchema.safeParse(question).success, question.id).toBe(true);
    }
  });

  it('has no duplicate question ids', () => {
    const ids = questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every question exactly four unique options', () => {
    for (const question of questions) {
      expect(question.options).toHaveLength(OPTIONS_PER_QUESTION);
      const optionIds = question.options.map((option) => option.id);
      const optionTexts = question.options.map((option) => option.text.trim().toLowerCase());
      expect(new Set(optionIds).size, question.id).toBe(OPTIONS_PER_QUESTION);
      expect(new Set(optionTexts).size, question.id).toBe(OPTIONS_PER_QUESTION);
    }
  });

  it('points correctOptionId at an option that exists', () => {
    for (const question of questions) {
      const ids = question.options.map((option) => option.id);
      expect(ids, question.id).toContain(question.correctOptionId);
    }
  });

  it('never explains the correct option as a distractor', () => {
    for (const question of questions) {
      for (const key of Object.keys(question.distractorExplanations ?? {})) {
        expect(key, question.id).not.toBe(question.correctOptionId);
        expect(question.options.map((option) => option.id), question.id).toContain(key);
      }
    }
  });

  it('references only vocabulary entries that exist', () => {
    const ids = new Set(entries.map((entry) => entry.id));
    for (const question of questions) {
      for (const wordId of question.wordIds) {
        expect(ids.has(wordId), `${question.id} -> ${wordId}`).toBe(true);
      }
    }
  });

  it('does not give the answer away through option length', () => {
    for (const question of questions) {
      const correct = question.options.find((o) => o.id === question.correctOptionId);
      const others = question.options.filter((o) => o.id !== question.correctOptionId);
      const longestOther = Math.max(...others.map((o) => o.text.length));
      expect(correct!.text.length, question.id).toBeLessThanOrEqual(longestOther * 3);
    }
  });

  it('gives every question a non-empty explanation', () => {
    for (const question of questions) {
      expect(question.explanation.trim().length, question.id).toBeGreaterThan(10);
    }
  });
});

describe('schema rejection', () => {
  it('rejects an entry with no senses', () => {
    const result = vocabularyEntrySchema.safeParse({
      id: 'w_bad',
      lemma: 'bad',
      slug: 'bad',
      cefr: 'B2',
      pronunciation: { kk: '/bæd/' },
      senses: [],
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid CEFR level', () => {
    const base = entries[0]!;
    expect(vocabularyEntrySchema.safeParse({ ...base, cefr: 'A1' }).success).toBe(false);
  });

  it('rejects a question whose correctOptionId is not among its options', () => {
    const base = questions[0]!;
    const result = quizQuestionSchema.safeParse({ ...base, correctOptionId: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects a question with duplicate option ids', () => {
    const base = questions[0]!;
    const duplicated = base.options.map((option) => ({ ...option, id: 'same' }));
    const result = quizQuestionSchema.safeParse({
      ...base,
      options: duplicated,
      correctOptionId: 'same',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a question with the wrong number of options', () => {
    const base = questions[0]!;
    const result = quizQuestionSchema.safeParse({ ...base, options: base.options.slice(0, 3) });
    expect(result.success).toBe(false);
  });
});
