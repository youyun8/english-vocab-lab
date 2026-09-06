import { useMemo, useState } from 'react';

import { Button, Card, EmptyState, ErrorNotice, Spinner } from '@/components/ui';
import { useProgress } from '@/features/progress/progress-context';
import { useSettings } from '@/features/settings/settings-context';
import { WordFiltersPanel } from '@/features/vocabulary/components/WordFiltersPanel';
import { WordCard, WordListRow } from '@/features/vocabulary/components/WordRow';
import { DEFAULT_FILTERS, collectTags, filterEntries } from '@/features/vocabulary/filtering';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { createEmptyProgress } from '@/domain/progress';

export function WordBankPage() {
  const { entries, ready, error } = useVocabulary();
  const { byWordId } = useProgress();
  const { settings, update } = useSettings();
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const now = useMemo(() => new Date(), []);
  const tags = useMemo(() => collectTags(entries), [entries]);

  const results = useMemo(
    () => filterEntries({ entries, progressByWordId: byWordId, filters, now }),
    [entries, byWordId, filters, now],
  );

  const emptyProgressFor = (wordId: string) =>
    byWordId.get(wordId) ?? createEmptyProgress(wordId, now.toISOString());

  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!ready) return <Spinner label="載入字彙庫" />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">字彙庫</h1>
          <p className="mt-1 text-sm text-ink-500">
            共 {entries.length} 個 B2–C2 字彙，可依等級、詞性、標籤與學習狀態篩選。
          </p>
        </div>

        <div className="flex gap-2">
          <div
            className="inline-flex rounded-md border border-ink-300 bg-surface p-0.5"
            role="group"
            aria-label="檢視方式"
          >
            <Button
              size="sm"
              variant={settings.wordBankView === 'list' ? 'primary' : 'ghost'}
              aria-pressed={settings.wordBankView === 'list'}
              onClick={() => void update({ wordBankView: 'list' })}
            >
              列表
            </Button>
            <Button
              size="sm"
              variant={settings.wordBankView === 'card' ? 'primary' : 'ghost'}
              aria-pressed={settings.wordBankView === 'card'}
              onClick={() => void update({ wordBankView: 'card' })}
            >
              卡片
            </Button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            篩選
          </Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        <aside
          className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}
          aria-label="字彙篩選"
        >
          <Card className="p-4 lg:sticky lg:top-20">
            <WordFiltersPanel
              filters={filters}
              onChange={setFilters}
              tags={tags}
              resultCount={results.length}
            />
          </Card>
        </aside>

        <section aria-label="字彙結果">
          {results.length === 0 ? (
            <EmptyState
              title="沒有符合條件的字彙"
              description="試著放寬篩選條件，或清除關鍵字。"
              action={
                <Button size="sm" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                  清除篩選
                </Button>
              }
            />
          ) : settings.wordBankView === 'card' ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((entry) => (
                <li key={entry.id}>
                  <WordCard entry={entry} progress={emptyProgressFor(entry.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <caption className="sr-only">字彙列表</caption>
                <thead>
                  <tr className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      單字 / KK
                    </th>
                    <th scope="col" className="hidden px-0 py-2.5 pr-4 font-medium sm:table-cell">
                      詞性
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      等級
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      中文意思
                    </th>
                    <th scope="col" className="py-2.5 pr-4 font-medium">
                      學習狀態
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_th]:px-4 [&_th:not(:first-child)]:px-0">
                  {results.map((entry) => (
                    <WordListRow
                      key={entry.id}
                      entry={entry}
                      progress={emptyProgressFor(entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
