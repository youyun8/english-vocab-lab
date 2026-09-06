import { useMemo, useState } from 'react';

import { Badge, Button, Card, EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import {
  questionTypeLabelZh,
  questionTypes,
  type Difficulty,
  type QuestionType,
} from '@/domain/quiz';
import { cefrLevels, type CefrLevel } from '@/domain/vocabulary';
import { QuestionBankCard } from '@/features/quiz/components/QuestionBankCard';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import {
  DEFAULT_QUESTION_BANK_FILTERS,
  buildQuestionBank,
  collectQuestionTags,
  filterQuestionBank,
  questionSourceLabelZh,
  summarizeQuestionBank,
  type QuestionBankFilters,
  type QuestionSource,
} from '@/services/question-bank';
import { cn } from '@/utils/cn';

export const QUESTIONS_PER_PAGE = 20;

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const SOURCES: QuestionSource[] = ['curated', 'generated'];

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

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function QuestionBankPage() {
  const { entries, questions: curated, byId, ready, error } = useVocabulary();
  const [filters, setFilters] = useState<QuestionBankFilters>({
    ...DEFAULT_QUESTION_BANK_FILTERS,
  });
  const [page, setPage] = useState(1);

  // Building the bank walks the whole corpus, so it happens once per corpus
  // load and never per keystroke.
  const bank = useMemo(() => buildQuestionBank(entries, curated), [entries, curated]);
  const summary = useMemo(() => summarizeQuestionBank(bank), [bank]);
  const tags = useMemo(() => collectQuestionTags(bank), [bank]);
  const results = useMemo(
    () => filterQuestionBank(bank, filters, byId),
    [bank, filters, byId],
  );

  const pageCount = Math.max(1, Math.ceil(results.length / QUESTIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visible = results.slice(
    (currentPage - 1) * QUESTIONS_PER_PAGE,
    currentPage * QUESTIONS_PER_PAGE,
  );

  const set = (patch: Partial<QuestionBankFilters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!ready) return <Spinner label="載入題庫" />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">題庫</h1>
        <p className="mt-1 text-sm text-ink-500">
          共 {summary.total} 題，涵蓋 {summary.coveredWords} 個字彙（人工編寫 {summary.curated} 題、
          依字彙庫自動生成 {summary.generated} 題）。選項一律顯示，答案預設隱藏：先自己選一個，
          或按「顯示答案」再核對。
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div>
          <label
            htmlFor="qb-search"
            className="mb-1.5 block text-xs font-semibold text-ink-500 uppercase"
          >
            搜尋
          </label>
          <input
            id="qb-search"
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="搜尋單字、題目或選項…"
            className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm placeholder:text-ink-400 focus:border-accent-500"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">題型</legend>
          <div className="flex flex-wrap gap-1.5">
            {questionTypes.map((type: QuestionType) => (
              <Chip
                key={type}
                active={filters.types.includes(type)}
                onClick={() => set({ types: toggle(filters.types, type) })}
              >
                {questionTypeLabelZh[type]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">CEFR</legend>
            <div className="flex flex-wrap gap-1.5">
              {cefrLevels.map((level: CefrLevel) => (
                <Chip
                  key={level}
                  active={filters.levels.includes(level)}
                  onClick={() => set({ levels: toggle(filters.levels, level) })}
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
                  active={filters.difficulties.includes(level)}
                  onClick={() => set({ difficulties: toggle(filters.difficulties, level) })}
                >
                  {level}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-ink-500 uppercase">來源</legend>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((source) => (
                <Chip
                  key={source}
                  active={filters.sources.includes(source)}
                  onClick={() => set({ sources: toggle(filters.sources, source) })}
                >
                  {questionSourceLabelZh[source]}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <label
            htmlFor="qb-tag"
            className="mb-1.5 block text-xs font-semibold text-ink-500 uppercase"
          >
            標籤
          </label>
          <select
            id="qb-tag"
            value={filters.tag}
            onChange={(event) => set({ tag: event.target.value })}
            className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm sm:max-w-xs"
          >
            <option value="">全部標籤</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-ink-200 pt-3">
          <Badge tone="muted">{results.length} 題符合條件</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilters({ ...DEFAULT_QUESTION_BANK_FILTERS });
              setPage(1);
            }}
          >
            清除篩選
          </Button>
        </div>
      </Card>

      {results.length === 0 ? (
        <EmptyState title="沒有符合條件的題目" description="請放寬篩選條件，或清除關鍵字。" />
      ) : (
        <>
          {/* Re-keying the list drops every card's revealed answer when the
              reader turns the page or changes a filter. */}
          <ul key={`${currentPage}-${JSON.stringify(filters)}`} className="space-y-3">
            {visible.map((question) => (
              <li key={question.id}>
                <QuestionBankCard question={question} />
              </li>
            ))}
          </ul>

          <nav aria-label="題庫分頁" className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-ink-500">
              第 {currentPage} / {pageCount} 頁 · 共 {results.length} 題
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                上一頁
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                下一頁
              </Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
