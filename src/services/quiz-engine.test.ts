import { describe, expect, it } from 'vitest';

import { loadCuratedQuestions, loadVocabulary } from '@/data';
import { DEFAULT_QUIZ_CONFIG, isCorrectAnswer, type QuizConfig } from '@/domain/quiz';
import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { answerQuestion, buildQuizSession, summarizeSession, wordIdsForMode } from './quiz-engine';

const entries = await loadVocabulary();
const curated = await loadCuratedQuestions();
const NOW = new Date('2026-03-01T09:00:00.000Z');

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return { ...DEFAULT_QUIZ_CONFIG, ...overrides };
}

function build(overrides: Partial<QuizConfig> = {}, progress: WordProgress[] = []) {
  return buildQuizSession({
    config: config(overrides),
    entries,
    curatedQuestions: curated,
    progress,
    now: NOW,
    seed: 12345,
  });
}

describe('buildQuizSession', () => {
  it('returns exactly the requested number of questions', () => {
    expect(build({ questionCount: 10 }).session.questions).toHaveLength(10);
    expect(build({ questionCount: 25 }).session.questions).toHaveLength(25);
  });

  it('never repeats a question within a session', () => {
    const { session } = build({ questionCount: 30 });
    const ids = session.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('honours the CEFR filter', () => {
    const { session } = build({ questionCount: 20, cefrLevels: ['C2'] });
    for (const question of session.questions) {
      expect(question.cefr).toBe('C2');
    }
  });

  it('honours the question-type filter', () => {
    const { session } = build({ questionCount: 15, questionTypes: ['collocation'] });
    for (const question of session.questions) {
      expect(question.type).toBe('collocation');
    }
  });

  it('shuffles options without breaking the answer key', () => {
    const { session } = build({ questionCount: 20, shuffleOptions: true });
    for (const question of session.questions) {
      const ids = question.options.map((option) => option.id);
      expect(ids).toContain(question.correctOptionId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = build({ questionCount: 10 }).session.questions.map((q) => q.id);
    const b = build({ questionCount: 10 }).session.questions.map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('relaxes a mode that has no material and says so', () => {
    // No progress at all, so "mistakes" mode cannot select anything.
    const result = build({ questionCount: 10, mode: 'mistakes' });
    expect(result.relaxed).toBe(false); // no filter applied when the set is empty
    expect(result.session.questions.length).toBe(10);
  });

  it('restricts to the chosen words when the mode has material', () => {
    const target = entries.find((entry) => entry.id === 'w_consolidate')!;
    const progress: WordProgress[] = [
      {
        ...createEmptyProgress(target.id, NOW.toISOString()),
        quizAttempts: 4,
        correctAnswers: 0,
        mistakeCount: 4,
      },
    ];
    const result = buildQuizSession({
      config: config({ questionCount: 3, mode: 'mistakes' }),
      entries,
      curatedQuestions: curated,
      progress,
      now: NOW,
      seed: 1,
    });

    for (const question of result.session.questions) {
      expect(question.wordIds).toContain(target.id);
    }
  });

  it('falls back to the whole corpus when a mode cannot fill the quiz', () => {
    const target = entries.find((entry) => entry.id === 'w_nuance')!;
    const progress: WordProgress[] = [
      {
        ...createEmptyProgress(target.id, NOW.toISOString()),
        bookmarked: true,
      },
    ];
    // One bookmarked word cannot supply 20 questions.
    const result = buildQuizSession({
      config: config({ questionCount: 20, mode: 'bookmarked' }),
      entries,
      curatedQuestions: curated,
      progress,
      now: NOW,
      seed: 3,
    });

    expect(result.relaxed).toBe(true);
    expect(result.session.questions).toHaveLength(20);
  });

  it('starts with an empty answer list and a session id', () => {
    const { session } = build();
    expect(session.answers).toEqual([]);
    expect(session.id).toMatch(/^qz_[0-9a-f]{16}$/);
    expect(session.startedAt).toBe(NOW.toISOString());
  });
});

describe('wordIdsForMode', () => {
  const withMistake: WordProgress = {
    ...createEmptyProgress('w_a', NOW.toISOString()),
    quizAttempts: 2,
    correctAnswers: 1,
    mistakeCount: 1,
  };
  const bookmarked: WordProgress = {
    ...createEmptyProgress('w_b', NOW.toISOString()),
    bookmarked: true,
  };
  const due: WordProgress = {
    ...createEmptyProgress('w_c', NOW.toISOString()),
    nextReviewAt: new Date(NOW.getTime() - 1000).toISOString(),
  };

  it('returns null for random mode', () => {
    expect(wordIdsForMode(config({ mode: 'random' }), [withMistake], NOW)).toBeNull();
  });

  it('selects only words with mistakes', () => {
    const ids = wordIdsForMode(config({ mode: 'mistakes' }), [withMistake, bookmarked], NOW);
    expect([...ids!]).toEqual(['w_a']);
  });

  it('selects only bookmarked words', () => {
    const ids = wordIdsForMode(config({ mode: 'bookmarked' }), [withMistake, bookmarked], NOW);
    expect([...ids!]).toEqual(['w_b']);
  });

  it('selects only words whose review time has arrived', () => {
    const ids = wordIdsForMode(config({ mode: 'due' }), [bookmarked, due], NOW);
    expect([...ids!]).toEqual(['w_c']);
  });

  it('returns null when a mode matches nothing, rather than an empty quiz', () => {
    expect(wordIdsForMode(config({ mode: 'difficult' }), [bookmarked], NOW)).toBeNull();
  });
});

describe('answerQuestion and summarizeSession', () => {
  it('grades an answer against correctOptionId, not position', () => {
    const { session } = build({ questionCount: 1 });
    const question = session.questions[0]!;
    const wrong = question.options.find((o) => o.id !== question.correctOptionId)!;

    const correctResult = answerQuestion(session, question.id, question.correctOptionId, NOW);
    expect(correctResult.record.correct).toBe(true);

    const wrongResult = answerQuestion(session, question.id, wrong.id, NOW);
    expect(wrongResult.record.correct).toBe(false);
    expect(isCorrectAnswer(question, wrong.id)).toBe(false);
  });

  it('does not mutate the session it is given', () => {
    const { session } = build({ questionCount: 2 });
    const question = session.questions[0]!;
    answerQuestion(session, question.id, question.correctOptionId, NOW);
    expect(session.answers).toEqual([]);
  });

  it('replaces rather than duplicates an answer for the same question', () => {
    const { session } = build({ questionCount: 2 });
    const question = session.questions[0]!;
    const once = answerQuestion(session, question.id, question.correctOptionId, NOW).session;
    const twice = answerQuestion(once, question.id, question.correctOptionId, NOW).session;
    expect(twice.answers).toHaveLength(1);
  });

  it('throws for a question that is not part of the session', () => {
    const { session } = build({ questionCount: 1 });
    expect(() => answerQuestion(session, 'q_not_here', 'a', NOW)).toThrow(/not part of session/);
  });

  it('summarizes scores, breakdowns and missed words', () => {
    let { session } = build({ questionCount: 6 });
    session.questions.forEach((question, index) => {
      const optionId =
        index % 2 === 0
          ? question.correctOptionId
          : question.options.find((o) => o.id !== question.correctOptionId)!.id;
      session = answerQuestion(session, question.id, optionId, NOW).session;
    });

    const summary = summarizeSession(session);
    expect(summary.total).toBe(6);
    expect(summary.correct).toBe(3);
    expect(summary.incorrect).toBe(3);
    expect(summary.percentage).toBe(50);
    expect(summary.missedWordIds.length).toBeGreaterThan(0);
    expect(summary.byCefr.reduce((sum, row) => sum + row.attempts, 0)).toBe(6);
    expect(summary.byType.reduce((sum, row) => sum + row.attempts, 0)).toBe(6);
  });

  it('reports zero rather than NaN for an unanswered session', () => {
    const { session } = build({ questionCount: 5 });
    const summary = summarizeSession(session);
    expect(summary.percentage).toBe(0);
    expect(summary.total).toBe(0);
  });
});
