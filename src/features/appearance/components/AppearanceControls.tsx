import {
  CONTENT_WIDTH_OPTIONS,
  FONT_SIZE_OPTIONS,
  THEME_OPTIONS,
  type Appearance,
} from '@/domain/appearance';
import { useAppearance } from '../appearance-context';
import { cn } from '@/utils/cn';

function ChoiceRow<Value extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (next: Value) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-800">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              value === option.value
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-300 bg-surface text-ink-600 hover:border-ink-400',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The appearance preferences themselves, without any chrome — rendered both in
 * the header popover and on the settings page so the two can never drift.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { appearance, update } = useAppearance();

  const set = <Key extends keyof Appearance>(key: Key) =>
    (next: Appearance[Key]) => update({ [key]: next } as Partial<Appearance>);

  return (
    <div className={cn('space-y-4', className)}>
      <ChoiceRow
        label="主題"
        options={THEME_OPTIONS}
        value={appearance.theme}
        onChange={set('theme')}
      />
      <ChoiceRow
        label="文字大小"
        options={FONT_SIZE_OPTIONS}
        value={appearance.fontSize}
        onChange={set('fontSize')}
      />
      <ChoiceRow
        label="內容寬度"
        hint="調整每行文字的長度，寬螢幕可讀性差異最明顯。"
        options={CONTENT_WIDTH_OPTIONS}
        value={appearance.contentWidth}
        onChange={set('contentWidth')}
      />
    </div>
  );
}
