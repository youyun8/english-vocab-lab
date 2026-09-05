import type { ExampleSentence as Example } from '@/domain/vocabulary';

/**
 * Splits the English sentence around `highlight` so the target word can be
 * emphasised without dangerously injecting HTML.
 */
function highlightParts(text: string, highlight?: string): [string, string, string] | null {
  if (!highlight) return null;
  const index = text.indexOf(highlight);
  if (index < 0) return null;
  return [
    text.slice(0, index),
    text.slice(index, index + highlight.length),
    text.slice(index + highlight.length),
  ];
}

export function ExampleSentenceView({
  example,
  showChinese = true,
}: {
  example: Example;
  showChinese?: boolean;
}) {
  const parts = highlightParts(example.en, example.highlight);

  return (
    <li className="border-l-2 border-ink-200 pl-3">
      <p lang="en" className="text-sm leading-relaxed text-ink-900">
        {parts ? (
          <>
            {parts[0]}
            <mark className="rounded-sm bg-amber-100 px-0.5 font-medium text-ink-900">
              {parts[1]}
            </mark>
            {parts[2]}
          </>
        ) : (
          example.en
        )}
      </p>
      {showChinese ? (
        <p lang="zh-Hant" className="mt-1 text-sm leading-relaxed text-ink-500">
          {example.zh}
        </p>
      ) : null}
    </li>
  );
}
