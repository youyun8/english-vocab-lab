import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { WordBankPage } from './WordBankPage';

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

async function renderPage() {
  renderWithProviders(<WordBankPage />, { route: '/words' });
  await screen.findByRole('heading', { level: 1, name: '字彙庫' });
}

function resultCount(): number {
  const rows = screen.queryAllByRole('row');
  // Subtract the header row.
  return Math.max(0, rows.length - 1);
}

describe('WordBankPage', () => {
  it('lists the whole corpus by default', async () => {
    await renderPage();
    expect(resultCount()).toBe(60);
    expect(screen.getByText('60 個結果')).toBeInTheDocument();
  });

  it('filters by keyword search', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋字彙'), 'consolidate');

    await waitFor(() => expect(resultCount()).toBe(1));
    expect(screen.getByRole('link', { name: 'consolidate' })).toBeInTheDocument();
  });

  it('filters by CEFR level', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'C2', pressed: false }));

    await waitFor(() => expect(resultCount()).toBe(12));
  });

  it('combines a level filter with a part-of-speech filter', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'C2', pressed: false }));
    const before = resultCount();

    await user.click(screen.getByRole('button', { name: '動詞', pressed: false }));

    await waitFor(() => expect(resultCount()).toBeLessThan(before));
  });

  it('shows an empty state when nothing matches, with a way out', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋字彙'), 'zzzzqqqq');

    expect(await screen.findByText('沒有符合條件的字彙')).toBeInTheDocument();

    // Both the filter panel and the empty state offer a reset; either works.
    await user.click(screen.getAllByRole('button', { name: '清除篩選' })[0]!);
    await waitFor(() => expect(resultCount()).toBe(60));
  });

  it('clears all filters at once', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: 'B2', pressed: false }));
    await waitFor(() => expect(resultCount()).toBe(18));

    await user.click(screen.getByRole('button', { name: '清除篩選' }));
    await waitFor(() => expect(resultCount()).toBe(60));
  });

  it('switches between list and card views', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByRole('table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '卡片' }));

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'consolidate' })).toBeInTheDocument();
  });

  it('sorts by CEFR level when asked', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('排序方式'), 'cefr');

    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1);
      const firstRow = rows[0]!;
      expect(within(firstRow).getByText('B2')).toBeInTheDocument();
    });
  });

  it('shows the KK transcription for each word', async () => {
    await renderPage();
    expect(screen.getByLabelText('KK 音標 /kənˈsɑləˌdet/')).toBeInTheDocument();
  });
});
