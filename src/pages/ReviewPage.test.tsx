import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyProgress, type WordProgress } from '@/domain/progress';
import { STORAGE_KEYS } from '@/repositories/anonymous-progress-repository';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { ReviewPage } from './ReviewPage';

const DAY = 86_400_000;

function seed(progress: WordProgress[]): void {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
}

function record(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
  return { ...createEmptyProgress(wordId, new Date().toISOString()), ...overrides };
}

async function renderPage() {
  renderWithProviders(<ReviewPage />, { route: '/review' });
  await screen.findByRole('heading', { level: 1, name: '複習' });
}

function rowLemmas(): string[] {
  const table = screen.queryByRole('table');
  if (!table) return [];
  return within(table)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

describe('ReviewPage', () => {
  it('shows an empty state when there is nothing to review', async () => {
    await renderPage();
    expect(screen.getByText('這個分類目前沒有字彙')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '開始測驗' })).toBeInTheDocument();
  });

  it('lists words whose review time has arrived', async () => {
    seed([
      record('w_consolidate', { nextReviewAt: new Date(Date.now() - DAY).toISOString() }),
      record('w_infer', { nextReviewAt: new Date(Date.now() + DAY).toISOString() }),
    ]);
    await renderPage();

    await waitFor(() => expect(rowLemmas()).toEqual(['consolidate']));
  });

  it('shows how overdue a word is', async () => {
    seed([record('w_consolidate', { nextReviewAt: new Date(Date.now() - 3 * DAY).toISOString() })]);
    await renderPage();

    await waitFor(() => expect(screen.getByText('逾期 3 天')).toBeInTheDocument());
  });

  it('switches to the all-mistakes tab', async () => {
    const user = userEvent.setup();
    seed([
      record('w_consolidate', { quizAttempts: 4, correctAnswers: 1, mistakeCount: 3 }),
      record('w_infer', { quizAttempts: 4, correctAnswers: 4 }),
    ]);
    await renderPage();

    await user.click(screen.getByRole('tab', { name: '所有錯題' }));

    await waitFor(() => expect(rowLemmas()).toEqual(['consolidate']));
  });

  it('lists frequently missed words only when they cross the threshold', async () => {
    const user = userEvent.setup();
    seed([
      record('w_consolidate', { quizAttempts: 5, correctAnswers: 1, mistakeCount: 4 }),
      record('w_infer', { quizAttempts: 5, correctAnswers: 4, mistakeCount: 1 }),
    ]);
    await renderPage();

    await user.click(screen.getByRole('tab', { name: '常錯字彙' }));

    await waitFor(() => expect(rowLemmas()).toEqual(['consolidate']));
  });

  it('lists difficult words', async () => {
    const user = userEvent.setup();
    seed([
      record('w_consolidate', { difficult: true, quizAttempts: 1 }),
      record('w_infer', { quizAttempts: 1 }),
    ]);
    await renderPage();

    await user.click(screen.getByRole('tab', { name: '困難字彙' }));

    await waitFor(() => expect(rowLemmas()).toEqual(['consolidate']));
  });

  it('lists resolved mistakes separately', async () => {
    const user = userEvent.setup();
    seed([
      record('w_consolidate', {
        quizAttempts: 6,
        correctAnswers: 4,
        mistakeCount: 2,
        reviewStreak: 3,
      }),
      record('w_infer', { quizAttempts: 2, correctAnswers: 0, mistakeCount: 2 }),
    ]);
    await renderPage();

    await user.click(screen.getByRole('tab', { name: '已克服' }));

    await waitFor(() => expect(rowLemmas()).toEqual(['consolidate']));
  });

  it('orders the weakest word first', async () => {
    const user = userEvent.setup();
    seed([
      record('w_infer', { quizAttempts: 10, correctAnswers: 8, mistakeCount: 2 }),
      record('w_consolidate', { quizAttempts: 10, correctAnswers: 1, mistakeCount: 9 }),
    ]);
    await renderPage();

    await user.click(screen.getByRole('tab', { name: '所有錯題' }));

    await waitFor(() => expect(rowLemmas()[0]).toBe('consolidate'));
  });

  it('offers shortcuts into the matching quiz modes', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: '複習到期字彙' })).toHaveAttribute(
      'href',
      '/quiz?mode=due',
    );
    expect(screen.getByRole('link', { name: '重做錯題' })).toHaveAttribute(
      'href',
      '/quiz?mode=mistakes',
    );
  });
});
