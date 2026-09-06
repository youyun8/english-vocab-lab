import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@/repositories/anonymous-progress-repository';
import { AppearanceProvider, useAppearance } from './appearance-context';
import { AppearanceMenu } from './components/AppearanceMenu';

/** Minimal `matchMedia`, which jsdom does not implement. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => query),
  });
  return {
    change(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
  };
}

function Probe() {
  const { appearance, resolvedTheme } = useAppearance();
  return <span data-testid="probe">{`${appearance.theme}/${resolvedTheme}`}</span>;
}

afterEach(() => {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-font-size');
  root.removeAttribute('data-width');
  root.style.colorScheme = '';
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('AppearanceProvider', () => {
  it('writes the defaults onto <html>', () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.fontSize).toBe('medium');
    expect(root.dataset.width).toBe('standard');
    expect(root.style.colorScheme).toBe('light');
  });

  it('restores what this browser stored', () => {
    localStorage.setItem(
      STORAGE_KEYS.appearance,
      JSON.stringify({ theme: 'dark', fontSize: 'large', contentWidth: 'narrow' }),
    );

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.fontSize).toBe('large');
    expect(root.dataset.width).toBe('narrow');
  });

  it('survives unreadable stored preferences', () => {
    localStorage.setItem(STORAGE_KEYS.appearance, 'not json');

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('system/light');
  });

  it('follows the system theme, including a later change', async () => {
    const media = stubMatchMedia(true);

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('system/dark');

    await act(() => media.change(false));
    expect(screen.getByTestId('probe')).toHaveTextContent('system/light');
  });
});

describe('AppearanceMenu', () => {
  it('opens, applies a choice and remembers it', async () => {
    const user = userEvent.setup();
    render(
      <AppearanceProvider>
        <AppearanceMenu />
      </AppearanceProvider>,
    );

    const trigger = screen.getByRole('button', { name: '外觀設定' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: '深色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: '大' }));
    expect(document.documentElement.dataset.fontSize).toBe('large');

    await user.click(screen.getByRole('button', { name: '寬' }));
    expect(document.documentElement.dataset.width).toBe('wide');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.appearance) ?? '{}')).toEqual({
      theme: 'dark',
      fontSize: 'large',
      contentWidth: 'wide',
    });
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <AppearanceProvider>
        <AppearanceMenu />
      </AppearanceProvider>,
    );

    await user.click(screen.getByRole('button', { name: '外觀設定' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
