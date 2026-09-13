import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { QUESTIONS_PER_PAGE, QuestionBankPage } from './QuestionBankPage';

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

// Loading and indexing the whole corpus takes longer than the default timeout.
const CORPUS_TIMEOUT = 20_000;

async function renderPage() {
  renderWithProviders(<QuestionBankPage />, { route: '/question-bank' });
  await screen.findByRole('heading', { level: 1, name: '題庫' }, { timeout: CORPUS_TIMEOUT });
  // The bank is built from the whole corpus, and a page materializes in two
  // async stages — the curated questions, then the entries the page's words
  // need — so waiting for the first card can leave a partial list on screen.
  // Wait for the full page instead, or the count assertions race the second
  // stage and fail only under the load of the whole suite.
  await waitFor(
    () => expect(screen.getAllByLabelText('答案選項')).toHaveLength(QUESTIONS_PER_PAGE),
    { timeout: CORPUS_TIMEOUT },
  );
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

    // The filter chip carries its facet count, so match the label as a prefix.
    await user.click(screen.getByRole('button', { name: /^英文釋義/, pressed: false }));

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

  it('searches for a single word and links it only once the answer is out', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋'), 'eliminate');

    // The word the item tests names the answer outright in a cloze or a 中譯英
    // item, so its link waits for the reveal along with the answer itself.
    await waitFor(() => expect(screen.getAllByLabelText('答案選項').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: 'eliminate' })).not.toBeInTheDocument();

    // The match may be any card on the page, so open them all. Each reveal
    // re-renders the list, so the buttons are re-queried on every turn rather
    // than captured up front.
    for (
      let next = screen.queryAllByRole('button', { name: '顯示答案' })[0];
      next != null;
      next = screen.queryAllByRole('button', { name: '顯示答案' })[0]
    ) {
      await user.click(next);
    }

    expect(screen.getAllByRole('link', { name: 'eliminate' }).length).toBeGreaterThan(0);
  });
});
