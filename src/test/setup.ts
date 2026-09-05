import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom does not implement speech synthesis; stub it so the pronunciation
// service takes its supported path in component tests.
if (!('speechSynthesis' in window)) {
  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    value: { speak: () => undefined, cancel: () => undefined },
  });
}
if (!('SpeechSynthesisUtterance' in window)) {
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    writable: true,
    value: class {
      lang = '';
      rate = 1;
      constructor(public text: string) {}
    },
  });
}
