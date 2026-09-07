import { useEffect, useMemo, useState } from 'react';

import { Button, EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import { ActiveFilters, FilterGroup, FilterRail, ToggleChip } from '@/components/ui/filters';
import {
  questionTypeLabelZh,
  questionTypes,
  type Difficulty,
  type QuestionType,
  type QuizQuestion,
} from '@/domain/quiz';
import { cefrLevels, type CefrLevel } from '@/domain/vocabulary';
import { QuestionBankCard } from '@/features/quiz/components/QuestionBankCard';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import {
  DEFAULT_QUESTION_BANK_FILTERS,
  buildQuestionRefs,
  collectQuestionTags,
  countActiveQuestionFilters,
  filterQuestionRefs,
  materializeQuestions,
  pageWordIds,
  questionFacetCounts,
  questionSourceLabelZh,
  summarizeQuestionBank,
  type QuestionBankFilters,
  type QuestionSource,
} from '@/services/question-bank';

export const QUESTIONS_PER_PAGE = 20;

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const SOURCES: QuestionSource[] = ['curated', 'generated'];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function QuestionBankPage() {
  const { summaries, ready: indexReady, error, loadEntries, loadQuestions } = useVocabulary();
  // The bank is browsed as references derived from the index; only the page in
  // front of the reader is turned into real questions, and only its words load.
  const [curated, setCurated] = useState<QuizQuestion[] | null>(null);
  const [pageQuestions, setPageQuestions] = useState<QuizQuestion[]>([]);
  const [buildingPage, setBuildingPage] = useState(false);
  const ready = indexReady && curated != null;
  const [filters, setFilters] = useState<QuestionBankFilters>({
    ...DEFAULT_QUESTION_BANK_FILTERS,
  });
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const bank = useMemo(
    () => (curated ? buildQuestionRefs(summaries, curated) : []),
    [summaries, curated],
  );
  const summary = useMemo(() => summarizeQuestionBank(bank), [bank]);
  const tags = useMemo(() => collectQuestionTags(bank), [bank]);
  const results = useMemo(() => filterQuestionRefs(bank, filters), [bank, filters]);
  const counts = useMemo(() => questionFacetCounts(bank, filters), [bank, filters]);
  const activeCount = countActiveQuestionFilters(filters);

  const pageCount = Math.max(1, Math.ceil(results.length / QUESTIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleRefs = useMemo(
    () => results.slice((currentPage - 1) * QUESTIONS_PER_PAGE, currentPage * QUESTIONS_PER_PAGE),
    [results, currentPage],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { targetIds, poolIds } = pageWordIds(visibleRefs, summaries);
      if (targetIds.length === 0) {
        if (!cancelled) setPageQuestions(materializeQuestions(visibleRefs, [], []));
        return;
      }
      setBuildingPage(true);
      const poolEntries = await loadEntries(poolIds).catch(() => []);
      const byEntryId = new Map(poolEntries.map((entry) => [entry.id, entry]));
      const targets = targetIds
        .map((id) => byEntryId.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => entry != null);
      if (cancelled) return;
      setPageQuestions(materializeQuestions(visibleRefs, targets, poolEntries));
      setBuildingPage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visibleRefs, summaries, loadEntries]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadQuestions().catch(() => []);
      if (!cancelled) setCurated(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQuestions]);

  const set = (patch: Partial<QuestionBankFilters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };
  const clear = () => {
    setFilters({ ...DEFAULT_QUESTION_BANK_FILTERS });
    setPage(1);
  };

  const applied = [
    ...(filters.query.trim()
      ? [{ key: 'query', label: `「${filters.query.trim()}」`, onRemove: () => set({ query: '' }) }]
      : []),
    ...filters.types.map((type) => ({
      key: `type-${type}`,
      label: questionTypeLabelZh[type],
      onRemove: () => set({ types: toggle(filters.types, type) }),
    })),
    ...filters.levels.map((level) => ({
      key: `level-${level}`,
      label: level,
      onRemove: () => set({ levels: toggle(filters.levels, level) }),
    })),
    ...filters.difficulties.map((level) => ({
      key: `difficulty-${level}`,
      label: `難度 ${level}`,
      onRemove: () => set({ difficulties: toggle(filters.difficulties, level) }),
    })),
    ...filters.sources.map((source) => ({
      key: `source-${source}`,
      label: questionSourceLabelZh[source],
      onRemove: () => set({ sources: toggle(filters.sources, source) }),
    })),
    ...(filters.tag
      ? [{ key: 'tag', label: filters.tag, onRemove: () => set({ tag: '' }) }]
      : []),
  ];

  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!ready) return <Spinner label="載入題庫" />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">題庫</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            共 {summary.total} 題，涵蓋 {summary.coveredWords} 個字彙（人工編寫 {summary.curated} 題、
            依字彙庫自動生成 {summary.generated} 題）。選項一律顯示，答案預設隱藏：先自己選一個，
            或按「顯示答案」再核對。
          </p>
        </div>
        <Button
          size="sm"
          variant={activeCount > 0 ? 'primary' : 'secondary'}
          className="lg:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          篩選{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <aside
          className={`${filtersOpen ? 'block' : 'hidden'} min-w-0 lg:sticky lg:top-20 lg:block lg:self-start`}
          aria-label="題庫篩選"
        >
          <FilterRail
            activeCount={activeCount}
            resultLabel={`${results.length} 題符合條件`}
            onClear={clear}
          >
            <div>
              <label htmlFor="qb-search" className="sr-only">
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

            {applied.length > 0 ? <ActiveFilters items={applied} /> : null}

            <FilterGroup
              label="題型"
              hint={filters.types.length > 0 ? `${filters.types.length}` : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {questionTypes.map((type: QuestionType) => (
                  <ToggleChip
                    key={type}
                    active={filters.types.includes(type)}
                    count={counts.types.get(type) ?? 0}
                    onClick={() => set({ types: toggle(filters.types, type) })}
                  >
                    {questionTypeLabelZh[type]}
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup
              label="來源"
              hint={filters.sources.length > 0 ? `${filters.sources.length}` : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((source) => (
                  <ToggleChip
                    key={source}
                    active={filters.sources.includes(source)}
                    count={counts.sources.get(source) ?? 0}
                    onClick={() => set({ sources: toggle(filters.sources, source) })}
                  >
                    {questionSourceLabelZh[source]}
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup
              label="CEFR 等級"
              hint={filters.levels.length > 0 ? `${filters.levels.length}` : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {cefrLevels.map((level: CefrLevel) => (
                  <ToggleChip
                    key={level}
                    active={filters.levels.includes(level)}
                    count={counts.levels.get(level) ?? 0}
                    onClick={() => set({ levels: toggle(filters.levels, level) })}
                  >
                    {level}
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup
              label="難度"
              hint={filters.difficulties.length > 0 ? `${filters.difficulties.length}` : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((level) => (
                  <ToggleChip
                    key={level}
                    active={filters.difficulties.includes(level)}
                    count={counts.difficulties.get(level) ?? 0}
                    onClick={() => set({ difficulties: toggle(filters.difficulties, level) })}
                  >
                    {level}
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup label="標籤" hint={filters.tag ? '1' : undefined}>
              <label htmlFor="qb-tag" className="sr-only">
                標籤
              </label>
              <select
                id="qb-tag"
                value={filters.tag}
                onChange={(event) => set({ tag: event.target.value })}
                className="w-full rounded-md border border-ink-300 bg-surface px-3 py-2 text-sm"
              >
                <option value="">全部標籤</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                    {counts.tags.has(tag) ? `（${counts.tags.get(tag)}）` : ''}
                  </option>
                ))}
              </select>
            </FilterGroup>
          </FilterRail>
        </aside>

        <section aria-label="題庫結果" className="min-w-0 space-y-4">
          {results.length === 0 ? (
            <EmptyState
              title="沒有符合條件的題目"
              description="請放寬篩選條件，或清除關鍵字。"
              action={
                <Button size="sm" onClick={clear}>
                  清除篩選
                </Button>
              }
            />
          ) : (
            <>
              {/* Re-keying the list drops every card's revealed answer when the
                  reader turns the page or changes a filter. */}
              <ul key={`${currentPage}-${JSON.stringify(filters)}`} className="space-y-3">
                {pageQuestions.map((question) => (
                  <li key={question.id}>
                    <QuestionBankCard question={question} />
                  </li>
                ))}
              </ul>
              {buildingPage && pageQuestions.length === 0 ? <Spinner label="準備題目" /> : null}

              <nav
                aria-label="題庫分頁"
                className="flex flex-wrap items-center justify-between gap-3"
              >
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
        </section>
      </div>
    </div>
  );
}
