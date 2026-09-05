/**
 * Browser speech synthesis wrapper.
 *
 * This is an audio convenience only - it is NOT a phonetic authority. The KK
 * transcription shown on the page is the authoritative pronunciation guide.
 */

export function isPronunciationSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export interface SpeakOptions {
  lang?: string;
  rate?: number;
}

/** Speaks a word. Returns false when the browser cannot do it. */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!isPronunciationSupported()) return false;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang ?? 'en-US';
    utterance.rate = options.rate ?? 0.95;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    // Some browsers throw when speech synthesis is disabled by policy.
    return false;
  }
}

export function cancelSpeech(): void {
  if (isPronunciationSupported()) {
    window.speechSynthesis.cancel();
  }
}
