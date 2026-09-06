import { Button, Card, SectionHeading } from '@/components/ui';
import {
  questionTypeLabelZh,
  questionTypes,
  quizModeLabelZh,
  quizModes,
  type QuestionType,
  type QuizConfig,
  type QuizMode,
} from '@/domain/quiz';
import { cefrLevels, type CefrLevel } from '@/domain/vocabulary';
import { cn } from '@/utils/cn';

function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-300 bg-surface text-ink-600 hover:border-ink-400',
      )}
    >
      {children}
    </button>
  );
}

/** Toggles a value, refusing to empty a list that must stay non-empty. */
function toggleNonEmpty<T>(list: readonly T[], value: T): T[] {
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return next.length === 0 ? [...list] : next;
}

export function QuizConfigForm({
  config,
  onChange,
  onStart,
  availableCount,
}: {
  config: QuizConfig;
  onChange: (next: QuizConfig) => void;
  onStart: () => void;
  availableCount: number;
}) {
  const set = (patch: Partial<QuizConfig>) => onChange({ ...config, ...patch });

  return (
    <Card className="mx-auto max-w-2xl p-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">開始測驗</h1>
      <p className="mt-1 text-sm text-ink-500">
        目前可出題數：{availableCount} 題。選定條件後即可開始。
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <SectionHeading>題數</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {[5, 10, 15, 20, 30].map((count) => (
              <Chip
                key={count}
                active={config.questionCount === count}
                onClick={() => set({ questionCount: count })}
              >
                {count} 題
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading>CEFR 等級</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {cefrLevels.map((level: CefrLevel) => (
              <Chip
                key={level}
                active={config.cefrLevels.includes(level)}
                onClick={() =>
                  set({ cefrLevels: toggleNonEmpty(config.cefrLevels, level) as [CefrLevel, ...CefrLevel[]] })
                }
              >
                {level}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading hint="至少選擇一種">題型</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {questionTypes.map((type: QuestionType) => (
              <Chip
                key={type}
                active={config.questionTypes.includes(type)}
                onClick={() =>
                  set({
                    questionTypes: toggleNonEmpty(config.questionTypes, type) as [
                      QuestionType,
                      ...QuestionType[],
                    ],
                  })
                }
              >
                {questionTypeLabelZh[type]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading hint="材料不足時會自動放寬">出題模式</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {quizModes.map((mode: QuizMode) => (
              <Chip
                key={mode}
                active={config.mode === mode}
                onClick={() => set({ mode })}
              >
                {quizModeLabelZh[mode]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <SectionHeading>選項順序</SectionHeading>
          <Chip
            active={config.shuffleOptions}
            onClick={() => set({ shuffleOptions: !config.shuffleOptions })}
          >
            {config.shuffleOptions ? '隨機排列選項' : '固定選項順序'}
          </Chip>
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="mt-8 w-full"
        onClick={onStart}
        disabled={availableCount === 0}
      >
        開始測驗
      </Button>
    </Card>
  );
}
