import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { QUESTIONS_PER_PAGE, QuestionBankPage } from './QuestionBankPage';

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

async function renderPage() {
  renderWithProviders(<QuestionBankPage />, { route: '/question-bank' });
  await screen.findByRole('heading', { level: 1, name: '題庫' });
  // The bank is built from the whole corpus, so wait for the first card.
  await waitFor(() => expect(screen.getAllByLabelText('答案選項').length).toBeGreaterThan(0));
}

function firstCard(): HTMLElement {
  return screen.getAllByLabelText('答案選項')[0]!.closest('li') as HTMLElement;
}

describe('QuestionBankPage', () => {
  it('shows the options of every listed question without revealing the answer', async () => {
    await renderPage();

    const groups = screen.getAllByLabelText('答案選項');
    expect(groups).toHaveLength(QUESTIONS_PER_PAGE);
    for (const group of groups) {
      expect(within(group).getAllByRole('button')).toHaveLength(4);
    }

    expect(screen.queryByText(/正確答案/)).not.toBeInTheDocument();
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '顯示答案' })).toHaveLength(QUESTIONS_PER_PAGE);
  });

  it('reveals the answer only for the question whose button was pressed', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getAllByRole('button', { name: '顯示答案' })[0]!);

    expect(screen.getAllByText(/正確答案/)).toHaveLength(1);
    expect(within(firstCard()).getByText(/正解/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '顯示答案' })).toHaveLength(
      QUESTIONS_PER_PAGE - 1,
    );
  });

  it('checks a chosen option and can hide the answer again', async () => {
    const user = userEvent.setup();
    await renderPage();

    const options = within(firstCard()).getAllByRole('group')[0]!;
    await user.click(within(options).getAllByRole('button')[0]!);

    const card = firstCard();
    expect(within(card).getByText(/正確答案/)).toBeInTheDocument();
    expect(within(card).getByText(/正確$|錯誤$/)).toBeInTheDocument();
    for (const button of within(card).getAllByLabelText('答案選項')[0]!.querySelectorAll('button')) {
      expect(button).toBeDisabled();
    }

    await user.click(within(card).getByRole('button', { name: '隱藏答案' }));
    expect(within(firstCard()).queryByText(/正確答案/)).not.toBeInTheDocument();
  });

  it('hides revealed answers again when the reader turns the page', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getAllByRole('button', { name: '顯示答案' })[0]!);
    expect(screen.getAllByText(/正確答案/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.queryByText(/正確答案/)).not.toBeInTheDocument();
  });

  it('filters the bank by question type and reports the result count', async () => {
    const user = userEvent.setup();
    await renderPage();

    const total = Number(/共 (\d+) 題/.exec(screen.getByText(/共 \d+ 題$/).textContent ?? '')?.[1]);
    expect(total).toBeGreaterThan(1000);

    await user.click(screen.getByRole('button', { name: '英文釋義' }));

    await waitFor(() => {
      const shown = Number(
        /(\d+) 題符合條件/.exec(screen.getByText(/題符合條件/).textContent ?? '')?.[1],
      );
      expect(shown).toBeGreaterThan(0);
      expect(shown).toBeLessThan(total);
    });
    for (const badge of screen.getAllByText('英文釋義')) {
      expect(badge).toBeInTheDocument();
    }
  });

  it('searches for a single word', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋'), 'eliminate');

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'eliminate' }).length).toBeGreaterThan(0),
    );
  });
});
