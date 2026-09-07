import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  LinkButton,
  SectionHeading,
  Spinner,
  StatTile,
} from '@/components/ui';
import { accuracy } from '@/domain/progress';
import { useAuth } from '@/features/auth/auth-context';
import { useProgress } from '@/features/progress/progress-context';
import { useLearningStats } from '@/features/stats/use-learning-stats';
import { Phonetic } from '@/features/vocabulary/components/Phonetic';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { weakWords } from '@/services/stats';
import { pickStudyBatch } from '@/services/quiz-engine';
import { createRng } from '@/utils/random';

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  denied: '您在 GitHub 取消了授權，因此沒有登入。',
  missing_parameters: '登入流程缺少必要參數，請重新嘗試。',
  invalid_state: '登入驗證失敗（state 不符或已過期），請重新登入。',
  token_exchange_failed: '無法向 GitHub 換取存取權杖，請稍後再試。',
  profile_fetch_failed: '無法讀取 GitHub 個人資料，請稍後再試。',
  unexpected_error: '登入時發生未預期的錯誤，請稍後再試。',
};

function LoginFailureNotice() {
  const [params, setParams] = useSearchParams();
  if (params.get('login') !== 'failed') return null;

  const reason = params.get('reason') ?? 'unexpected_error';
  const message = LOGIN_ERROR_MESSAGES[reason] ?? LOGIN_ERROR_MESSAGES.unexpected_error;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm text-red-800">{message}</p>
      <button
        type="button"
        onClick={() => setParams({}, { replace: true })}
        className="shrink-0 text-xs text-red-700 underline"
      >
        關閉
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { summaries, ready, error } = useVocabulary();
  const { progress, byWordId } = useProgress();
  const { stats } = useLearningStats();
  const { status, user } = useAuth();

  const now = useMemo(() => new Date(), []);
  const byIdSummary = useMemo(
    () => new Map(summaries.map((word) => [word.id, word])),
    [summaries],
  );
  const weak = useMemo(() => weakWords(summaries, progress, now, 6), [summaries, progress, now]);

  const recentMistakes = useMemo(
    () =>
      progress
        .filter((item) => item.mistakeCount > 0 && item.lastReviewedAt)
        .sort(
          (a, b) => Date.parse(b.lastReviewedAt ?? '') - Date.parse(a.lastReviewedAt ?? ''),
        )
        .slice(0, 6)
        .map((item) => byIdSummary.get(item.wordId))
        .filter((word): word is NonNullable<typeof word> => word != null),
    [progress, byIdSummary],
  );

  const recentActivity = useMemo(
    () =>
      progress
        .filter((item) => item.lastReviewedAt)
        .sort(
          (a, b) => Date.parse(b.lastReviewedAt ?? '') - Date.parse(a.lastReviewedAt ?? ''),
        )
        .slice(0, 8),
    [progress],
  );

  const lastStudied = recentActivity[0];
  const lastStudiedEntry = lastStudied ? byIdSummary.get(lastStudied.wordId) : undefined;

  // A deterministic "next up" batch of unseen words, refreshed daily.
  const suggested = useMemo(() => {
    const unseen = summaries.filter((word) => !byWordId.has(word.id));
    const seed = Math.floor(now.getTime() / 86_400_000);
    return pickStudyBatch(unseen.length > 0 ? unseen : summaries, 5, createRng(seed));
  }, [summaries, byWordId, now]);

  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!ready) return <Spinner label="載入學習資料" />;

  return (
    <div className="space-y-6">
      <LoginFailureNotice />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">學習總覽</h1>
          <p className="mt-1 text-sm text-ink-500">
            {status === 'authenticated' && user
              ? `${user.githubName ?? user.githubLogin}，進度已同步至雲端。`
              : status === 'unavailable'
                ? '目前無法連線至伺服器，進度暫存於本機瀏覽器。'
                : '目前為未登入模式，進度儲存在這個瀏覽器。登入後即可跨裝置同步。'}
          </p>
        </div>
        {stats.currentStreakDays > 0 ? (
          <Badge tone="success">連續學習 {stats.currentStreakDays} 天</Badge>
        ) : null}
      </header>

      <section aria-label="學習數字">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="已學習" value={stats.studiedWords} hint={`共 ${stats.totalWords} 字`} />
          <StatTile label="學習中" value={stats.statusCounts.learning} tone="warning" />
          <StatTile label="複習中" value={stats.statusCounts.reviewing} tone="accent" />
          <StatTile label="已精熟" value={stats.statusCounts.mastered} tone="success" />
          <StatTile
            label="待複習"
            value={stats.dueForReview}
            tone={stats.dueForReview > 0 ? 'warning' : 'neutral'}
          />
          <StatTile
            label="正確率"
            value={`${Math.round(stats.overallAccuracy * 100)}%`}
            hint={`${stats.totalQuestionsAnswered} 題`}
          />
        </dl>
      </section>

      <section aria-label="快速動作">
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/quiz" variant="primary">
            開始測驗
          </LinkButton>
          <LinkButton to="/words" variant="secondary">
            瀏覽字彙庫
          </LinkButton>
          <LinkButton to="/quiz?mode=due" variant="secondary">
            複習到期字彙（{stats.dueForReview}）
          </LinkButton>
          <LinkButton to="/quiz?mode=mistakes" variant="secondary">
            複習錯題
          </LinkButton>
          <LinkButton to="/quiz?mode=weak" variant="secondary">
            加強弱點字彙
          </LinkButton>
          {lastStudiedEntry ? (
            <LinkButton to={`/words/${lastStudiedEntry.slug}`} variant="ghost">
              繼續上次：{lastStudiedEntry.lemma}
            </LinkButton>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading hint="每日更新">建議接下來學習</SectionHeading>
          <ul className="divide-y divide-ink-100">
            {suggested.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    to={`/words/${entry.slug}`}
                    lang="en"
                    className="text-sm font-medium text-ink-900 hover:underline"
                  >
                    {entry.lemma}
                  </Link>
                  <Phonetic kk={entry.kk} className="ml-2 text-xs" />
                </div>
                <Badge tone="neutral">{entry.cefr}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionHeading hint="弱點分數由高到低">最需要加強</SectionHeading>
          {weak.length === 0 ? (
            <EmptyState
              title="還沒有弱點資料"
              description="完成一份測驗後，系統就會開始追蹤您的弱點字彙。"
              action={
                <LinkButton to="/quiz" size="sm" variant="primary">
                  開始測驗
                </LinkButton>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {weak.map((row) => (
                <li key={row.entry.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    to={`/words/${row.entry.slug}`}
                    lang="en"
                    className="text-sm font-medium text-ink-900 hover:underline"
                  >
                    {row.entry.lemma}
                  </Link>
                  <span className="text-xs text-ink-500 tabular-nums">
                    正確率 {Math.round(accuracy(row.progress) * 100)}% · 錯{' '}
                    {row.progress.mistakeCount} 次
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading>最近答錯的字</SectionHeading>
          {recentMistakes.length === 0 ? (
            <p className="text-sm text-ink-500">目前沒有錯題紀錄。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {recentMistakes.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={`/words/${entry.slug}`}
                    lang="en"
                    className="rounded border border-ink-300 px-2 py-1 text-sm text-ink-800 hover:border-ink-500"
                  >
                    {entry.lemma}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading hint={`收藏 ${stats.bookmarked} · 困難 ${stats.difficult}`}>
            最近學習活動
          </SectionHeading>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-ink-500">尚無學習紀錄。</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recentActivity.map((item) => {
                const entry = byIdSummary.get(item.wordId);
                if (!entry) return null;
                return (
                  <li key={item.wordId} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      to={`/words/${entry.slug}`}
                      lang="en"
                      className="text-sm text-ink-800 hover:underline"
                    >
                      {entry.lemma}
                    </Link>
                    <span className="text-xs text-ink-400 tabular-nums">
                      {item.lastReviewedAt?.slice(0, 10)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
