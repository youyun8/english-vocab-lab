import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/domain/settings';
import { createEmptyProgress } from '@/domain/progress';
import { STORAGE_KEYS } from '@/repositories/anonymous-progress-repository';
import { PROGRESS_EXPORT_VERSION } from '@/shared/api';
import { ANONYMOUS_API, mockApi, renderWithProviders } from '@/test/render';
import { SettingsPage } from './SettingsPage';

const NOW = '2026-03-01T00:00:00.000Z';

function fileFrom(contents: unknown): File {
  return new File([JSON.stringify(contents)], 'import.json', { type: 'application/json' });
}

function validExport(overrides: Record<string, unknown> = {}) {
  return {
    version: PROGRESS_EXPORT_VERSION,
    exportedAt: NOW,
    settings: { ...DEFAULT_SETTINGS, questionsPerQuiz: 20 },
    progress: [
      { ...createEmptyProgress('w_consolidate', NOW), quizAttempts: 5, correctAnswers: 4 },
    ],
    ...overrides,
  };
}

async function renderPage() {
  renderWithProviders(<SettingsPage />, { route: '/settings' });
  await screen.findByRole('heading', { level: 1, name: '設定' });
}

beforeEach(() => {
  mockApi(ANONYMOUS_API);
  localStorage.clear();
});

describe('SettingsPage', () => {
  it('persists a changed quiz length locally', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('button', { name: '20', pressed: false }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? '{}') as {
        questionsPerQuiz: number;
      };
      expect(stored.questionsPerQuiz).toBe(20);
    });
  });

  it('toggles a boolean setting', async () => {
    const user = userEvent.setup();
    await renderPage();

    const toggle = screen.getByRole('switch', { name: '啟用發音功能' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('refuses to leave the CEFR range empty', async () => {
    const user = userEvent.setup();
    await renderPage();

    for (const level of ['B2', 'C1', 'C2']) {
      await user.click(screen.getByRole('button', { name: level, pressed: true }));
    }

    // The last remaining level must still be selected.
    await waitFor(() => {
      const selected = ['B2', 'C1', 'C2'].filter(
        (level) =>
          screen.getByRole('button', { name: level }).getAttribute('aria-pressed') === 'true',
      );
      expect(selected.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('imports a valid file and applies both settings and progress', async () => {
    const user = userEvent.setup();
    await renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileFrom(validExport()));

    expect(await screen.findByText(/已匯入 1 筆學習紀錄與設定/)).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]') as {
        wordId: string;
      }[];
      expect(stored.map((item) => item.wordId)).toContain('w_consolidate');
    });
  });

  it('rejects a malformed file without touching existing data', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify([{ ...createEmptyProgress('w_existing', NOW), quizAttempts: 3 }]),
    );
    await renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileFrom({ version: PROGRESS_EXPORT_VERSION, nonsense: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/未變更任何資料/);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]') as {
      wordId: string;
    }[];
    expect(stored.map((item) => item.wordId)).toEqual(['w_existing']);
  });

  it('rejects a file that is not JSON at all', async () => {
    const user = userEvent.setup();
    await renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['definitely not json'], 'x.json', { type: 'application/json' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/JSON/);
  });

  it('rejects an unsupported export version', async () => {
    const user = userEvent.setup();
    await renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, fileFrom(validExport({ version: 99 })));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('requires an explicit confirmation before clearing local progress', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify([createEmptyProgress('w_existing', NOW)]),
    );
    await renderPage();

    await user.click(screen.getByRole('button', { name: '清除本機進度' }));

    // Nothing is deleted until the confirmation is clicked.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '確認清除' }));

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEYS.progress)).toBeNull());
  });

  it('lets the user back out of a destructive action', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEYS.progress,
      JSON.stringify([createEmptyProgress('w_existing', NOW)]),
    );
    await renderPage();

    await user.click(screen.getByRole('button', { name: '清除本機進度' }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('button', { name: '確認清除' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) ?? '[]')).toHaveLength(1);
  });

  it('does not offer cloud deletion to anonymous users', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: '清除雲端進度' })).not.toBeInTheDocument();
  });
});
