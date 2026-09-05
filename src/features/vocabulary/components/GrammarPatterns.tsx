/**
 * Grammar patterns get their own visual treatment so that a learner can scan a
 * word's syntactic behaviour without reading the prose.
 */
export function GrammarPatternList({ patterns }: { patterns: string[] }) {
  if (patterns.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {patterns.map((pattern) => (
        <li
          key={pattern}
          lang="en"
          className="rounded border border-accent-100 bg-accent-50 px-2 py-1 font-mono text-xs text-accent-700"
        >
          {pattern}
        </li>
      ))}
    </ul>
  );
}
