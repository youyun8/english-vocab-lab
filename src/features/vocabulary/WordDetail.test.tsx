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

  it('keeps the 誤／正 contrast inside the usage notes', async () => {
    // The separate 常見錯誤 section is gone; the notes it carried now live in
    // 使用注意 so a word page has one place to look for "do not say this".
    renderWord('preference');
    await screen.findByRole('heading', { level: 1, name: 'preference' });

    expect(screen.getByText(/誤：I prefer coffee than tea.／正：I prefer coffee to tea./))
      .toBeInTheDocument();
    expect(screen.queryByText(/✗ 錯誤/)).not.toBeInTheDocument();
  });

  it('lays every sense out to the same section order', async () => {
    // The unified spec: whatever the word, the sections that are present appear
    // in this order and never in another, so pages read the same way.
    renderWord('consolidate');
    await screen.findByRole('heading', { level: 1, name: 'consolidate' });

    const spec = ['文法句型', '常用用法與片語', '例句', '使用注意'];
    // Scoped to one sense at a time: read across senses, every drop back to an
    // earlier section looks like the start of the next one, and the sequence
    // check accepts any order at all.
    const senses = document.querySelectorAll('section[aria-labelledby^="sense-"]');
    expect(senses.length).toBeGreaterThan(1);

    for (const sense of senses) {
      const positions = [...sense.querySelectorAll('h2, h3, h4')]
        .map((heading) => spec.findIndex((label) => (heading.textContent ?? '').startsWith(label)))
        .filter((position) => position >= 0);
      // Grammar patterns are required of every sense, so each one opens with
      // 文法句型 and the sections it has follow in spec order, none repeated.
      expect(positions[0]).toBe(0);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(new Set(positions).size).toBe(positions.length);
    }
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
