import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { useAppearance } from '../appearance-context';
import { AppearanceControls } from './AppearanceControls';

/** Sun for the light theme, moon for the dark one. */
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dark ? (
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5m0-14.2-1.5 1.5M6.4 17.6l-1.5 1.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Header entry point for the appearance preferences. It is a popover rather
 * than a link so a theme or text-size change can be seen on the page you are
 * already reading.
 */
export function AppearanceMenu() {
  const { resolvedTheme } = useAppearance();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        size="sm"
        variant="ghost"
        aria-label="外觀設定"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
      >
        <ThemeIcon dark={resolvedTheme === 'dark'} />
        <span className="hidden sm:inline">外觀</span>
      </Button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="外觀設定"
          className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-ink-200 bg-surface p-4 shadow-lg"
        >
          <AppearanceControls />
          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            外觀設定只會儲存在這個瀏覽器。
          </p>
        </div>
      ) : null}
    </div>
  );
}
