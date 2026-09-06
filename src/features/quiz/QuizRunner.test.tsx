import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCuratedQuestions, loadVocabulary } from '@/data';
import { DEFAULT_QUIZ_CONFIG, type QuizSession } from '@/domain/quiz';
import { buildQuizSession } from '@/services/quiz-engine';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { QuizRunner } from './components/QuizRunner';

const entries = await loadVocabulary();
const curated = await loadCuratedQuestions();

function makeSession(count = 3): QuizSession {
  return buildQuizSession({
    config: { ...DEFAULT_QUIZ_CONFIG, questionCount: count, shuffleOptions: false },
    entries,
    curatedQuestions: curated,
    progress: [],
    now: new Date('2026-03-01T00:00:00.000Z'),
    seed: 99,
  }).session;
}

function setup(
  overrides: Partial<Omit<React.ComponentProps<typeof QuizRunner>, 'onAnswer' | 'onComplete' | 'onQuit'>> = {},
) {
  const session = overrides.session ?? makeSession();
  const onAnswer = vi.fn<(questionId: string, optionId: string, correct: boolean) => void>();
  const onComplete = vi.fn<(session: QuizSession) => void>();
  const onQuit = vi.fn<() => void>();

  renderWithProviders(
    <QuizRunner
      keyboardShortcutsEnabled
      {...overrides}
      session={session}
      onAnswer={onAnswer}
      onComplete={onComplete}
      onQuit={onQuit}
    />,
  );
  return { session, onAnswer, onComplete, onQuit };
}

beforeEach(() => {
  mockApi(ANONYMOUS_API);
});

describe('QuizRunner', () => {
  it('shows the first question and its options', () => {
    const { session } = setup();
    const question = session.questions[0]!;

    expect(screen.getByText(question.prompt)).toBeInTheDocument();
    for (const option of question.options) {
      expect(screen.getByText(option.text)).toBeInTheDocument();
    }
    expect(screen.getByText('第 1 / 3 題')).toBeInTheDocument();
  });

  it('marks a correct answer and reveals the explanation', async () => {
    const user = userEvent.setup();
    const { session, onAnswer } = setup();
    const question = session.questions[0]!;
    const correct = question.options.find((o) => o.id === question.correctOptionId)!;

    await user.click(screen.getByText(correct.text));

    expect(screen.getByText('✓ 答對了')).toBeInTheDocument();
    expect(screen.getByText(question.explanation)).toBeInTheDocument();
    expect(onAnswer).toHaveBeenCalledWith(question.id, correct.id, true);
  });

  it('marks a wrong answer and shows the correct one', async () => {
    const user = userEvent.setup();
    const { session, onAnswer } = setup();
    const question = session.questions[0]!;
    const wrong = question.options.find((o) => o.id !== question.correctOptionId)!;
    const correct = question.options.find((o) => o.id === question.correctOptionId)!;

    await user.click(screen.getByText(wrong.text));

    expect(screen.getByText('✗ 答錯了')).toBeInTheDocument();
    expect(screen.getByText(/正確答案/)).toBeInTheDocument();
    // Once in the option list, once again in the feedback panel.
    expect(screen.getAllByText(correct.text).length).toBeGreaterThanOrEqual(2);
    expect(onAnswer).toHaveBeenCalledWith(question.id, wrong.id, false);
  });

  it('does not auto-advance after answering', async () => {
    const user = userEvent.setup();
    const { session } = setup();
    const question = session.questions[0]!;

    await user.click(screen.getByText(question.options[0]!.text));

    // Still on question 1, waiting for the learner to read the explanation.
    expect(screen.getByText('第 1 / 3 題')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一題' })).toBeInTheDocument();
  });

  it('locks the options once an answer is chosen', async () => {
    const user = userEvent.setup();
    const { session, onAnswer } = setup();
    const question = session.questions[0]!;

    // Scope to the option group: after answering, the same texts also appear in
    // the feedback panel, so a bare getByText would be ambiguous.
    const options = () => within(screen.getByRole('group', { name: '答案選項' }));

    await user.click(options().getByText(question.options[0]!.text));
    await user.click(options().getByText(question.options[1]!.text));

    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('advances to the next question via the button', async () => {
    const user = userEvent.setup();
    const { session } = setup();

    await user.click(screen.getByText(session.questions[0]!.options[0]!.text));
    await user.click(screen.getByRole('button', { name: '下一題' }));

    expect(screen.getByText('第 2 / 3 題')).toBeInTheDocument();
    expect(screen.getByText(session.questions[1]!.prompt)).toBeInTheDocument();
  });

  it('selects an answer with the number keys', async () => {
    const user = userEvent.setup();
    const { session, onAnswer } = setup();
    const question = session.questions[0]!;

    await user.keyboard('2');

    expect(onAnswer).toHaveBeenCalledWith(question.id, question.options[1]!.id, expect.any(Boolean));
  });

  it('advances with Enter', async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard('1');
    await user.keyboard('{Enter}');

    expect(screen.getByText('第 2 / 3 題')).toBeInTheDocument();
  });

  it('ignores Enter before an answer has been given', async () => {
    const user = userEvent.setup();
    setup();

    await user.keyboard('{Enter}');
    expect(screen.getByText('第 1 / 3 題')).toBeInTheDocument();
  });

  it('does not fire shortcuts when they are disabled', async () => {
    const user = userEvent.setup();
    const { onAnswer } = setup({ keyboardShortcutsEnabled: false });

    await user.keyboard('1');
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('completes the session on the last question', async () => {
    const user = userEvent.setup();
    const { session, onComplete } = setup({ session: makeSession(1) });

    await user.click(screen.getByText(session.questions[0]!.options[0]!.text));
    await user.click(screen.getByRole('button', { name: '查看結果' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ id: session.id });
  });

  it('lets the learner quit early', async () => {
    const user = userEvent.setup();
    const { onQuit } = setup();

    await user.click(screen.getByRole('button', { name: '結束測驗' }));
    expect(onQuit).toHaveBeenCalledOnce();
  });

  it('conveys correctness with text, not only colour', async () => {
    const user = userEvent.setup();
    const { session } = setup();
    const question = session.questions[0]!;
    const wrong = question.options.find((o) => o.id !== question.correctOptionId)!;

    await user.click(screen.getByText(wrong.text));

    // "錯誤" on the chosen option and "正解" on the right one.
    expect(screen.getByText(/✗ 錯誤/)).toBeInTheDocument();
    expect(screen.getByText(/✓ 正解/)).toBeInTheDocument();
  });

  it('exposes progress to assistive technology', () => {
    setup();
    const bar = screen.getByRole('progressbar', { name: '測驗進度' });
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });
});
