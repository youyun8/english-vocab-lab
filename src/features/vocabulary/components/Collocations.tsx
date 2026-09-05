import type { Collocation } from '@/domain/vocabulary';

import { ExampleSentenceView } from './ExampleSentence';

/** Collocations are a first-class learning feature, not a footnote. */
export function CollocationList({
  collocations,
  showChinese = true,
}: {
  collocations: Collocation[];
  showChinese?: boolean;
}) {
  if (collocations.length === 0) return null;

  return (
    <ul className="space-y-2">
      {collocations.map((collocation) => (
        <li
          key={collocation.text}
          className="rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span lang="en" className="text-sm font-medium text-ink-900">
              {collocation.text}
            </span>
            {showChinese && collocation.meaningZh ? (
              <span className="text-sm text-ink-500">{collocation.meaningZh}</span>
            ) : null}
          </div>
          {collocation.example ? (
            <ul className="mt-2">
              <ExampleSentenceView example={collocation.example} showChinese={showChinese} />
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
