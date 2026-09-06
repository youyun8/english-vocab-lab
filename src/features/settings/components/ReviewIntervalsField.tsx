import { useState } from 'react';

import { Button } from '@/components/ui';
import {
  REVIEW_INTERVAL_PRESETS,
  matchesPreset,
  parseIntervalInput,
} from '@/domain/settings';
import { cn } from '@/utils/cn';

/**
 * Editor for the spaced-repetition ladder.
 *
 * Presets cover the common cases; the text field is there for learners who want
 * an exact schedule. Input is validated before it is applied, so a half-typed
 * value never reaches the scheduler.
 */
export function ReviewIntervalsField({
  value,
  onChange,
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
}) {
  const serialized = value.join(', ');
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reset the draft when the ladder changes elsewhere — a preset click, an
   * import, or a reset. This is React's documented "adjust state while
   * rendering" pattern; doing it in an effect would render once with a stale
   * draft and then immediately render again.
   */
  const [syncedWith, setSyncedWith] = useState(serialized);
  if (syncedWith !== serialized) {
    setSyncedWith(serialized);
    setDraft(serialized);
    setError(null);
  }

  const activePreset = matchesPreset(value);
  const dirty = draft.trim() !== serialized;

  const apply = () => {
    const result = parseIntervalInput(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.days);
  };

  return (
    <div className="py-3">
      <p className="text-sm font-medium text-ink-800">複習間隔</p>
      <p className="mt-0.5 text-xs text-ink-500">
        每答對一次，下次複習就往後推一階。最後一個階段會一直重複；答錯則回到第一階。
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {REVIEW_INTERVAL_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePreset === preset.id}
            onClick={() => onChange([...preset.days])}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              activePreset === preset.id
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-300 bg-white text-ink-600 hover:border-ink-400',
            )}
          >
            {preset.labelZh}
            <span className="ml-1.5 text-xs opacity-70">{preset.days.join('/')}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="review-intervals" className="sr-only">
            自訂複習間隔（天數，以逗號分隔）
          </label>
          <input
            id="review-intervals"
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
            }}
            aria-invalid={error != null}
            aria-describedby={error ? 'review-intervals-error' : 'review-intervals-hint'}
            placeholder="1, 3, 7, 14, 30"
            className="w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm tabular-nums"
          />
          <p id="review-intervals-hint" className="mt-1 text-xs text-ink-400">
            以逗號分隔的天數，需由小到大遞增；每個值 1–365 天，最多 10 個階段。
          </p>
        </div>
        <Button size="md" variant="secondary" onClick={apply} disabled={!dirty}>
          套用
        </Button>
      </div>

      {error ? (
        <p id="review-intervals-error" role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-ink-500">
        目前設定：答錯後 {value[0]} 天複習
        {value.length > 1 ? `，連續答對後依序為 ${value.slice(1).join('、')} 天` : ''}。
        連續答對 {Math.max(1, value.length - 1)} 次且正確率達 80% 即視為精熟。
      </p>
    </div>
  );
}
