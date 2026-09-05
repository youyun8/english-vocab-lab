/**
 * Renders a KK transcription.
 *
 * The dedicated font stack is what guarantees ə ɪ ʊ æ ɑ ɔ ʌ ɛ ɝ ɚ θ ð ʃ ʒ ŋ
 * render correctly rather than falling back to tofu boxes.
 */
export function Phonetic({ kk, className = '' }: { kk: string; className?: string }) {
  return (
    <span
      className={`phonetic text-ink-600 ${className}`}
      lang="en-US"
      aria-label={`KK 音標 ${kk}`}
    >
      {kk}
    </span>
  );
}
