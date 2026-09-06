import type { QuizOption } from '@/domain/quiz';
import { cn } from '@/utils/cn';

export type OptionState = 'idle' | 'correct' | 'incorrect' | 'revealed-correct';

const stateClasses: Record<OptionState, string> = {
  idle: 'border-ink-300 bg-surface hover:border-ink-500',
  correct: 'border-emerald-500 bg-emerald-50',
  incorrect: 'border-red-500 bg-red-50',
  'revealed-correct': 'border-emerald-400 bg-emerald-50/60',
};

/**
 * Correctness is signalled with an icon and a text label as well as colour, so
 * the feedback survives for colour-blind users and screen readers.
 */
const stateLabel: Record<OptionState, string | null> = {
  idle: null,
  correct: '正確',
  incorrect: '錯誤',
  'revealed-correct': '正解',
};

export function QuizOptionButton({
  option,
  index,
  state,
  disabled,
  showShortcut,
  onSelect,
}: {
  option: QuizOption;
  index: number;
  state: OptionState;
  disabled: boolean;
  showShortcut: boolean;
  onSelect: () => void;
}) {
  const label = stateLabel[state];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-describedby={label ? `${option.id}-state` : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
        'min-h-[3rem] disabled:cursor-default',
        stateClasses[state],
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-ink-300 text-xs font-medium text-ink-500"
      >
        {showShortcut ? index + 1 : String.fromCharCode(65 + index)}
      </span>
      <span className="flex-1 text-sm leading-relaxed text-ink-900">{option.text}</span>
      {label ? (
        <span
          id={`${option.id}-state`}
          className={cn(
            'shrink-0 text-xs font-semibold',
            state === 'incorrect' ? 'text-red-700' : 'text-emerald-700',
          )}
        >
          {state === 'incorrect' ? '✗' : '✓'} {label}
        </span>
      ) : null}
    </button>
  );
}
