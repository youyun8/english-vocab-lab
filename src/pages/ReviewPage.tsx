import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Card, EmptyState, LinkButton, Spinner } from '@/components/ui';
import { accuracy, type WordProgress } from '@/domain/progress';
import { overdueDays, weaknessScore } from '@/domain/review';
import { useProgress } from '@/features/progress/progress-context';
import { Phonetic } from '@/features/vocabulary/components/Phonetic';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import type { VocabularySummary } from '@/domain/vocabulary';
import { cn } from '@/utils/cn';

type ReviewTab =
  | 'due'
  | 'all-mistakes'
  | 'recent-mistakes'
  | 'frequent'
  | 'difficult'
  | 'resolved';

const TABS: { key: ReviewTab; label: string; hint: string }[] = [
  { key: 'due', label: '到期複習', hint: '排程時間已到的字彙' },
  { key: 'all-mistakes', label: '所有錯題', hint: '曾經答錯過的字彙' },
  { key: 'recent-mistakes', label: '最近錯題', hint: '七天內答錯且尚未答對' },
  { key: 'frequent', label: '常錯字彙', hint: '答錯三次以上' },
  { key: 'difficult', label: '困難字彙', hint: '手動或自動標記為困難' },
  { key: 'resolved', label: '已克服', hint: '曾經答錯，現已連續答對' },
];

const RECENT_DAYS = 7;

interface Row {
  entry: VocabularySummary;
  progress: WordProgress;
  score: number;
}

function selectRows(tab: ReviewTab, rows: Row[], now: Date): Row[] {
  switch (tab) {
    case 'due':
      return rows
        .filter((row) => row.progress.nextReviewAt != null && overdueDays(row.progress, now) >= 0 &&
          Date.parse(row.progress.nextReviewAt) <= now.getTime())
        .sort((a, b) => overdueDays(b.progress, now) - overdueDays(a.progress, now));

    case 'all-mistakes':
      return rows.filter((row) => row.progress.mistakeCount > 0);

    case 'recent-mistakes':
      return rows.filter((row) => {
        if (row.progress.mistakeCount === 0 || row.progress.reviewStreak > 0) return false;
        if (!row.progress.lastReviewedAt) return false;
        const age = (now.getTime() - Date.parse(row.progress.lastReviewedAt)) / 86_400_000;
        return age <= RECENT_DAYS;
      });

    case 'frequent':
      return rows.filter((row) => row.progress.mistakeCount >= 3);

    case 'difficult':
      return rows.filter((row) => row.progress.difficult);

    case 'resolved':
      return rows.filter(
        (row) => row.progress.mistakeCount > 0 && row.progress.reviewStreak >= 2,
      );
  }
}

function ReviewRow({ row, now }: { row: Row; now: Date }) {
  const overdue = overdueDays(row.progress, now);

  return (
    <tr className="border-b border-ink-100 last:border-b-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal align-top">
        <Link
          to={`/words/${row.entry.slug}`}
          lang="en"
          className="font-medium text-ink-900 underline decoration-transparent underline-offset-2 hover:decoration-ink-400"
        >
          {row.entry.lemma}
        </Link>
        <div className="mt-0.5">
          <Phonetic kk={row.entry.kk} className="text-xs" />
        </div>
      </th>
      <td className="py-3 pr-4 align-top">
        <Badge tone="neutral">{row.entry.cefr}</Badge>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-ink-500 tabular-nums">
        {row.progress.mistakeCount}
      </td>
      <td className="py-3 pr-4 align-top text-sm text-ink-500 tabular-nums">
        {row.progress.quizAttempts > 0
          ? `${Math.round(accuracy(row.progress) * 100)}%`
          : '—'}
      </td>
      <td className="py-3 pr-4 align-top text-sm text-ink-500 tabular-nums">
        {row.progress.reviewStreak}
      </td>
      <td className="py-3 align-top text-sm">
        {overdue > 0 ? (
          <span className="text-amber-700">逾期 {Math.floor(overdue)} 天</span>
        ) : row.progress.nextReviewAt ? (
          <span className="text-ink-500">
            {new Date(row.progress.nextReviewAt).toISOString().slice(0, 10)}
          </span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
    </tr>
  );
}

export function ReviewPage() {
  const { byId, ready } = useVocabulary();
  const { progress } = useProgress();
  const [tab, setTab] = useState<ReviewTab>('due');
  const now = useMemo(() => new Date(), []);

  const rows = useMemo<Row[]>(() => {
    return progress
      .map((item) => {
        const entry = byId.get(item.wordId);
        return entry
          ? { entry, progress: item, score: weaknessScore(item, now) }
          : null;
      })
      .filter((row): row is Row => row !== null)
      .sort((a, b) => b.score - a.score || a.entry.lemma.localeCompare(b.entry.lemma));
  }, [byId, progress, now]);

  const visible = useMemo(() => selectRows(tab, rows, now), [tab, rows, now]);
  const activeTab = TABS.find((item) => item.key === tab);

  if (!ready) return <Spinner label="載入複習資料" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">複習</h1>
          <p className="mt-1 text-sm text-ink-500">
            依據錯誤次數、正確率、逾期天數與困難標記計算弱點分數，最需要複習的排在最前面。
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton to="/quiz?mode=due" variant="primary" size="sm">
            複習到期字彙
          </LinkButton>
          <LinkButton to="/quiz?mode=mistakes" variant="secondary" size="sm">
            重做錯題
          </LinkButton>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="複習類別">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              tab === item.key
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-300 bg-surface text-ink-600 hover:border-ink-400',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTab ? <p className="text-xs text-ink-500">{activeTab.hint}</p> : null}

      {visible.length === 0 ? (
        <EmptyState
          title="這個分類目前沒有字彙"
          description={
            tab === 'due'
              ? '沒有到期的複習項目。做一份測驗就會開始建立複習排程。'
              : '先做幾份測驗，系統就能找出您的弱點字彙。'
          }
          action={
            <LinkButton to="/quiz" size="sm" variant="primary">
              開始測驗
            </LinkButton>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">{activeTab?.label} 字彙列表</caption>
            <thead>
              <tr className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  單字
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  等級
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  錯誤次數
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  正確率
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  連續答對
                </th>
                <th scope="col" className="py-2.5 font-medium">
                  下次複習
                </th>
              </tr>
            </thead>
            <tbody className="[&_th]:px-4 [&_th:not(:first-child)]:px-0">
              {visible.map((row) => (
                <ReviewRow key={row.entry.id} row={row} now={now} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
