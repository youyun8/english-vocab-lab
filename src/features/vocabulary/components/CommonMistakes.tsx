import type { CommonMistake } from '@/domain/vocabulary';

/**
 * Incorrect/correct pairs are labelled in text as well as colour, so the
 * distinction survives for screen readers and colour-blind users.
 */
export function CommonMistakeList({ mistakes }: { mistakes: CommonMistake[] }) {
  if (mistakes.length === 0) return null;

  return (
    <ul className="space-y-3">
      {mistakes.map((mistake, index) => (
        <li
          key={`${mistake.explanationZh}-${index}`}
          className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2"
        >
          {mistake.incorrect ? (
            <p className="text-sm">
              <span className="mr-2 font-medium text-red-700">✗ 錯誤</span>
              <span lang="en" className="text-ink-700 line-through decoration-red-400">
                {mistake.incorrect}
              </span>
            </p>
          ) : null}
          {mistake.correct ? (
            <p className="mt-1 text-sm">
              <span className="mr-2 font-medium text-emerald-700">✓ 正確</span>
              <span lang="en" className="text-ink-900">
                {mistake.correct}
              </span>
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{mistake.explanationZh}</p>
        </li>
      ))}
    </ul>
  );
}
