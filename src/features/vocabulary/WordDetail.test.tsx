import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { STORAGE_KEYS } from '@/repositories/anonymous-progress-repository';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { WordDetailPage } from '@/pages/WordDetailPage';

function renderWord(slug: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/words/:slug" element={<WordDetailPage />} />
    </Routes>,
    { route: `/words/${slug}` },
  );
}

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

describe('WordDetailPage', () => {
  it('renders the headword, KK transcription and CEFR level', async () => {
    renderWord('consolidate');

    expect(await screen.findByRole('heading', { level: 1, name: 'consolidate' })).toBeInTheDocument();
    expect(screen.getByLabelText('KK 音標 /kənˈsɑləˌdet/')).toBeInTheDocument();
    expect(screen.getByText('C1')).toBeInTheDocument();
  });

  it('renders every sense with English and Chinese definitions', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    expect(
      screen.getByText('to combine several things into a single stronger or more effective whole'),
    ).toBeInTheDocument();
    expect(screen.getByText('整合；合併')).toBeInTheDocument();
    // The second sense is present too.
    expect(screen.getByText('鞏固（地位、權力、優勢）')).toBeInTheDocument();
  });

  it('renders the Traditional Chinese usage explanation', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });
    expect(screen.getAllByText('用法解析').length).toBeGreaterThan(0);
    expect(screen.getByText(/consolidate 常表示把原本分散的資源/)).toBeInTheDocument();
  });

  it('renders grammar patterns, collocations and examples', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    expect(screen.getByText('consolidate A into B')).toBeInTheDocument();
    expect(screen.getByText('consolidate data')).toBeInTheDocument();
    // The sentence is split around a <mark>, so match the trailing fragment.
    expect(
      screen.getByText(/several internal tools into a single platform\./),
    ).toBeInTheDocument();
  });

  it('highlights the target word inside an example sentence', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
  });

  it('renders common mistakes with explicit incorrect/correct labels', async () => {
    renderWord('preference');
    await screen.findByRole('heading', { level: 1, name: 'preference' });

    expect(screen.getAllByText(/✗ 錯誤/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/✓ 正確/).length).toBeGreaterThan(0);
    expect(screen.getByText('I prefer coffee than tea.')).toBeInTheDocument();
  });

  it('renders a confusing-word comparison table', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    const table = screen.getByRole('table', { name: /consolidate 與相似字詞的差異比較/ });
    expect(within(table).getByText('integrate')).toBeInTheDocument();
  });

  it('links a cross-referenced word to its own page', async () => {
    renderWord('infer');
    await screen.findByRole('heading', { level: 1, name: 'infer' });

    const link = screen.getAllByRole('link', { name: 'imply' })[0]!;
    expect(link).toHaveAttribute('href', '/words/imply');
  });

  it('toggles the bookmark and persists it locally', async () => {
    const user = userEvent.setup();
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    const bookmark = screen.getByRole('button', { name: /收藏/ });
    expect(bookmark).toHaveAttribute('aria-pressed', 'false');

    await user.click(bookmark);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /已收藏/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]') as {
      wordId: string;
      bookmarked: boolean;
    }[];
    expect(stored.find((item) => item.wordId === 'w_consolidate')?.bookmarked).toBe(true);
  });

  it('toggles the difficult marker', async () => {
    const user = userEvent.setup();
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    await user.click(screen.getByRole('button', { name: /標為困難/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /已標為困難/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('marks the word as seen so it leaves the "new" state', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]') as {
        wordId: string;
        status: string;
        timesSeen: number;
      }[];
      const record = stored.find((item) => item.wordId === 'w_consolidate');
      expect(record?.status).toBe('learning');
      expect(record?.timesSeen).toBeGreaterThanOrEqual(1);
    });
  });

  it('offers a pronunciation control', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });
    expect(screen.getByRole('button', { name: '發音：consolidate' })).toBeEnabled();
  });

  it('shows a not-found page for an unknown slug', async () => {
    renderWord('this-word-does-not-exist');
    expect(
      await screen.findByRole('heading', { level: 1, name: '找不到這個頁面' }),
    ).toBeInTheDocument();
  });
});
