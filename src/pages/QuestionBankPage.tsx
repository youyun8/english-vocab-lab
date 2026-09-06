import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Card, EmptyState, SectionHeading, Spinner } from '@/components/ui';
import {
  questionTypeLabelZh,
  questionTypes,
  type Difficulty,
  type QuestionType,
  type QuizQuestion,
} from '@/domain/quiz';
import { cefrLevels, type CefrLevel } from '@/domain/vocabulary';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { cn } from '@/utils/cn';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-ink-900 bg-ink-900 text-white'
          : 'border-ink-300 bg-surface text-ink-600 hover:border-ink-400',
      )}
    >
      {children}
    </button>
  );
}

function QuestionRow({ question }: { question: QuizQuestion }) {
  const { byId } = useVocabulary();
  const words = question.wordIds
    .map((id) => byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return (
    <Card className="p-4">
      <details>
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{questionTypeLabelZh[question.type]}</Badge>
            <Badge tone="neutral">{question.cefr}</Badge>
            <Badge tone="muted">難度 {question.difficulty}</Badge>
            {words.map((word) => (
              <Link
                key={word.id}
                to={`/words/${word.slug}`}
                lang="en"
                className="text-xs text-accent-600 underline underline-offset-2"
                onClick={(event) => event.stopPropagation()}
              >
                {word.lemma}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-sm font-medium text-ink-900">{question.prompt}</p>
          {question.context ? (
            <p className="mt-1 text-sm text-ink-600">{question.context}</p>
          ) : null}
          <p className="mt-2 text-xs text-ink-400">展開查看選項與詳解</p>
        </summary>

        <div className="mt-4 space-y-3 border-t border-ink-200 pt-4">
          <ol className="space-y-1.5">
            {question.options.map((option) => {
              const isCorrect = option.id === question.correctOptionId;
              const distractorNote = question.distractorExplanations?.[option.id];
              return (
                <li
                  key={option.id}
                  className={cn(
                    'rounded border px-3 py-2 text-sm',
                    isCorrect
                      ? 'border-emerald-300 bg-emerald-50 text-ink-900'
                      : 'border-ink-200 text-ink-700',
                  )}
                >
                  <span className="mr-2 font-medium text-ink-500">
                    {isCorrect ? '✓' : '·'}
                  </span>
                  {option.text}
                  {distractorNote ? (
                    <span className="mt-1 block text-xs text-ink-500">{distractorNote}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <div>
            <SectionHeading>詳解</SectionHeading>
            <p className="text-sm leading-relaxed text-ink-700">{question.explanation}</p>
          </div>

          <p className="text-xs text-ink-400">
            來源：{question.source === 'curated' ? '人工編寫' : '自動生成'}
            {question.tags.length > 0 ? ` · ${question.tags.join('、')}` : ''}
          </p>
        </div>
      </details>
    </Card>
  );
}

export function QuestionBankPage() {
  const { questions, entries, ready } = useVocabulary();

  const [wordId, setWordId] = useState('');
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [levels, setLevels] = useState<CefrLevel[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [tag, setTag] = useState('');

  const allTags = useMemo(
    () => [...new Set(questions.flatMap((q) => q.tags))].sort((a, b) => a.localeCompare(b)),
    [questions],
  );

  const filtered = useMemo(
    () =>
      questions.filter((question) => {
        if (wordId && !question.wordIds.includes(wordId)) return false;
        if (types.length > 0 && !types.includes(question.type)) return false;
        if (levels.length > 0 && !levels.includes(question.cefr)) return false;
        if (difficulties.length > 0 && !difficulties.includes(question.difficulty)) return false;
        if (tag && !question.tags.includes(tag)) return false;
        return true;
      }),
    [questions, wordId, types, levels, difficulties, tag],
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  if (!ready) return <Spinner label="載入題庫" />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">題庫</h1>
        <p className="mt-1 text-sm text-ink-500">
          共 {questions.length} 題人工編寫的題目，可獨立於測驗之外瀏覽、檢視詳解。
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="qb-word" className="mb-1.5 block text-xs font-semibold text-ink-500 uppercase">
              字彙
            </label>
            <select
              id="qb-word"
              value={wordId}
              onChange={(event) => setWordId(event.target.value)}
              className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm"
            >
              <option value="">全部字彙</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.lemma}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qb-tag" className="mb-1.5 block text-xs font-semibold text-ink-500 uppercase">
              標籤
            </label>
            <select
              id="qb-tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm"
            >
              <option value="">全部標籤</option>
              {allTags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">題型</legend>
          <div className="flex flex-wrap gap-1.5">
            {questionTypes.map((type) => (
              <Chip
                key={type}
                active={types.includes(type)}
                onClick={() => setTypes(toggle(types, type))}
              >
                {questionTypeLabelZh[type]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">CEFR</legend>
          <div className="flex flex-wrap gap-1.5">
            {cefrLevels.map((level) => (
              <Chip
                key={level}
                active={levels.includes(level)}
                onClick={() => setLevels(toggle(levels, level))}
              >
                {level}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">難度</legend>
          <div className="flex flex-wrap gap-1.5">
            {DIFFICULTIES.map((level) => (
              <Chip
                key={level}
                active={difficulties.includes(level)}
                onClick={() => setDifficulties(toggle(difficulties, level))}
              >
                {level}
              </Chip>
            ))}
          </div>
        </fieldset>

        <p className="border-t border-ink-200 pt-3 text-xs text-ink-500">
          {filtered.length} 題符合條件
        </p>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState title="沒有符合條件的題目" description="請放寬篩選條件。" />
      ) : (
        <ul className="space-y-3">
          {filtered.map((question) => (
            <li key={question.id}>
              <QuestionRow question={question} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
