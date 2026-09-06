import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { WordDetailPage } from './WordDetailPage';

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

function renderWord(slug: string) {
  return renderWithProviders(
    <Routes><Route path="/words/:slug" element={<WordDetailPage />} /></Routes>,
    { route: `/words/${slug}` },
  );
}

describe('word content tiers', () => {
  it('shows dictionary provenance and estimated difficulty without empty lesson sections', async () => {
    renderWord('hypothesis');
    expect(await screen.findByRole('heading', { name: 'hypothesis' })).toBeInTheDocument();
    expect(screen.getByText(/字典擴充詞條/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT 授權' })).toHaveAttribute('href', '/licenses/ECDICT-MIT.txt');
    expect(screen.getByText(/B2（估）/)).toBeInTheDocument();
    expect(screen.queryByText('例句 · Examples')).not.toBeInTheDocument();
    expect(screen.queryByText('用法解析')).not.toBeInTheDocument();
  });

  it('preserves examples and usage guidance in the original curated lessons', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { name: 'consolidate' });
    expect(screen.getAllByText('例句 · Examples').length).toBeGreaterThan(0);
    expect(screen.getAllByText('用法解析').length).toBeGreaterThan(0);
    expect(screen.queryByText(/字典擴充詞條/)).not.toBeInTheDocument();
  });
});
