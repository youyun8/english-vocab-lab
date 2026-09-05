import { useEffect } from 'react';

import { speak } from '@/services/pronunciation';

/** True when the user is typing, in which case shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Word-detail shortcuts: Space pronounces, B toggles the bookmark.
 * Both are disabled while any form control has focus.
 */
export function useWordShortcuts({
  enabled,
  lemma,
  onBookmark,
}: {
  enabled: boolean;
  lemma: string;
  onBookmark: () => void;
}): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.code === 'Space') {
        event.preventDefault();
        speak(lemma);
        return;
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        onBookmark();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, lemma, onBookmark]);
}
