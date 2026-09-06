import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { WordBankPage, WORDS_PER_PAGE } from './WordBankPage';

// Counts are derived from the corpus so that adding vocabulary does not break
// these tests; what they assert is the filtering behaviour, not the corpus size.
const entries = await loadVocabulary();
const TOTAL = entries.length;
const countAtLevel = (level: 'B2' | 'C1' | 'C2') =>
  entries.filter((entry) => entry.cefr === level).length;

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

async function renderPage() {
  renderWithProviders(<WordBankPage />, { route: '/words' });
  await screen.findByRole('heading', { level: 1, name: '字彙庫' });
}

/** Filter chips carry their facet count, so match the label as a prefix. */
function levelChip(level: 'B2' | 'C1' | 'C2') {
  return screen.getByRole('button', { name: new RegExp(`^${level}(?![0-9A-Za-z])`), pressed: false });
}

function resultCount(): number {
  const rows = screen.queryAllByRole('row');
  // Subtract the header row.
  return Math.max(0, rows.length - 1);
}

describe('WordBankPage', () => {
  it('paginates the corpus and displays its full result count', async () => {
    await renderPage();
    expect(resultCount()).toBe(Math.min(TOTAL, WORDS_PER_PAGE));
    expect(screen.getByText(`${TOTAL} 個結果`)).toBeInTheDocument();
  });

  it('moves between pages and resets to the first page when filtering', async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '下一頁' }));
    const sorted = [...entries].sort((a, b) => a.lemma.localeCompare(b.lemma));
    expect(screen.getByRole('link', { name: sorted[WORDS_PER_PAGE]!.lemma })).toBeInTheDocument();
    await user.type(screen.getByLabelText('搜尋字彙'), 'hypothesis');
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'hypothesis' })).toBeInTheDocument();
  });

  it('filters by keyword search' , async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋字彙'), 'consolidate');

    // "consolidate" also appears in other entries' comparison notes, so assert
    // that the exact headword ranks first rather than that it is the only hit.
    await waitFor(() => expect(resultCount()).toBeLessThan(TOTAL));
    const firstRow = screen.getAllByRole('row')[1]!;
    expect(within(firstRow).getByRole('link', { name: 'consolidate' })).toBeInTheDocument();
  });

  it('filters by CEFR level', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(levelChip('C2'));

    await waitFor(() => expect(resultCount()).toBe(Math.min(countAtLevel('C2'), WORDS_PER_PAGE)));
  });

  it('combines a level filter with a part-of-speech filter', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(levelChip('C2'));
    const before = countAtLevel('C2');

    await user.click(screen.getByRole('button', { name: /^動詞/, pressed: false }));

    const expected = entries.filter((entry) => entry.cefr === 'C2' && entry.senses.some((sense) => sense.partOfSpeech === 'verb')).length;
    expect(expected).toBeLessThan(before);
    await waitFor(() => expect(screen.getByText(`${expected} 個結果`)).toBeInTheDocument());
  });

  it('shows an empty state when nothing matches, with a way out', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText('搜尋字彙'), 'zzzzqqqq');

    expect(await screen.findByText('沒有符合條件的字彙')).toBeInTheDocument();

    // Both the filter panel and the empty state offer a reset; either works.
    await user.click(screen.getAllByRole('button', { name: '清除篩選' })[0]!);
    await waitFor(() => expect(resultCount()).toBe(Math.min(TOTAL, WORDS_PER_PAGE)));
  });

  it('clears all filters at once', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(levelChip('B2'));
    await waitFor(() => expect(resultCount()).toBe(Math.min(countAtLevel('B2'), WORDS_PER_PAGE)));

    await user.click(screen.getByRole('button', { name: '清除篩選' }));
    await waitFor(() => expect(resultCount()).toBe(Math.min(TOTAL, WORDS_PER_PAGE)));
  });

  it('switches between list and card views', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(screen.getByRole('table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '卡片' }));

    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: [...entries].sort((a, b) => a.lemma.localeCompare(b.lemma))[0]!.lemma })).toBeInTheDocument();
  });

  it('sorts by CEFR level when asked', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByLabelText('排序方式'), 'cefr');

    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1);
      const firstRow = rows[0]!;
      expect(within(firstRow).getByText(/^B2/)).toBeInTheDocument();
    });
  });

  it('shows the KK transcription for each word', async () => {
    await renderPage();
    const first = [...entries].sort((a, b) => a.lemma.localeCompare(b.lemma))[0]!;
    expect(screen.getByLabelText(`KK 音標 ${first.pronunciation.kk}`)).toBeInTheDocument();
  });
});
