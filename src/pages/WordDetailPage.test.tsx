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
  it('shows dictionary provenance and estimated difficulty, with lesson content now that every dictionary entry is edited', async () => {
    renderWord('hypothesis');
    expect(await screen.findByRole('heading', { name: 'hypothesis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT 授權' })).toHaveAttribute('href', '/licenses/ECDICT-MIT.txt');
    expect(screen.getByText('B2')).toBeInTheDocument();
    expect(screen.getAllByText('例句 · Examples').length).toBeGreaterThan(0);
    expect(screen.getAllByText('用法解析').length).toBeGreaterThan(0);
    expect(screen.queryByText(/字典擴充詞條/)).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未逐條人工校訂/)).not.toBeInTheDocument();
  });

  it('preserves examples and usage guidance in the original curated lessons', async () => {
    renderWord('consolidate');
    await screen.findByRole('heading', { name: 'consolidate' });
    expect(screen.getAllByText('例句 · Examples').length).toBeGreaterThan(0);
    expect(screen.getAllByText('用法解析').length).toBeGreaterThan(0);
    expect(screen.queryByText(/字典擴充詞條/)).not.toBeInTheDocument();
  });

  it('shows edited bilingual lessons without obsolete notices and retains attribution', async () => {
    renderWord('abide');
    await screen.findByRole('heading', { name: 'abide' });
    expect(screen.getAllByText('例句 · Examples')).toHaveLength(3);
    expect(screen.getAllByText('用法解析')).toHaveLength(3);
    expect(screen.getByText('遵守規則、決定或協議')).toBeInTheDocument();
    expect(screen.getByText("All members must abide by the club's rules.")).toBeInTheDocument();
    expect(screen.queryByText(/尚未|各義項不一定逐一對應/)).not.toBeInTheDocument();
    expect(screen.queryByText(/（估）/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MIT 授權' })).toHaveAttribute('href', '/licenses/ECDICT-MIT.txt');
  });
});
