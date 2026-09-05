import { Link } from 'react-router-dom';

import { Card, EmptyState, LinkButton, SectionHeading, StatTile, Spinner } from '@/components/ui';
import { questionTypeLabelZh, type QuestionType } from '@/domain/quiz';
import { bucketAccuracy } from '@/domain/stats';
import { useProgress } from '@/features/progress/progress-context';
import { ActivityChart, AccuracyBar, StatusBar } from '@/features/stats/components/Charts';
import { useLearningStats } from '@/features/stats/use-learning-stats';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { strongWords, weakWords } from '@/services/stats';
import { useAuth } from '@/features/auth/auth-context';

export function StatsPage() {
  const { stats, loading } = useLearningStats();
  const { entries, ready } = useVocabulary();
  const { progress } = useProgress();
  const { status } = useAuth();

  if (!ready || loading) return <Spinner label="計算學習統計" />;

  const now = new Date();
  const weak = weakWords(entries, progress, now, 8);
  const strong = strongWords(entries, progress, 8);

  const typeRows = (Object.keys(stats.accuracyByQuestionType) as QuestionType[])
    .map((type) => ({ type, bucket: stats.accuracyByQuestionType[type] }))
    .filter((row) => row.bucket != null)
    .sort((a, b) => bucketAccuracy(b.bucket) - bucketAccuracy(a.bucket));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">學習分析</h1>
        <p className="mt-1 text-sm text-ink-500">
          所有統計皆由學習紀錄即時推算，不另外儲存衍生資料。
          {status !== 'authenticated' ? '（未登入時，題型分析需登入後才會累積。）' : ''}
        </p>
      </header>

      <section aria-label="總覽數字">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="字彙總數" value={stats.totalWords} />
          <StatTile label="學習中" value={stats.statusCounts.learning} tone="warning" />
          <StatTile label="複習中" value={stats.statusCounts.reviewing} tone="accent" />
          <StatTile label="已精熟" value={stats.statusCounts.mastered} tone="success" />
          <StatTile label="收藏" value={stats.bookmarked} />
          <StatTile label="困難" value={stats.difficult} tone="danger" />
        </dl>
      </section>

      <section aria-label="測驗數字">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="平均正確率"
            value={`${Math.round(stats.overallAccuracy * 100)}%`}
            tone="accent"
          />
          <StatTile label="累計作答" value={stats.totalQuestionsAnswered} />
          <StatTile label="完成測驗" value={stats.quizzesCompleted} />
          <StatTile
            label="待複習"
            value={stats.dueForReview}
            tone={stats.dueForReview > 0 ? 'warning' : 'neutral'}
          />
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading hint={`已學習 ${stats.studiedWords} / ${stats.totalWords}`}>
            學習狀態分布
          </SectionHeading>
          <StatusBar
            counts={[
              { label: '未學習', value: stats.statusCounts.new, className: 'bg-ink-300' },
              { label: '學習中', value: stats.statusCounts.learning, className: 'bg-amber-400' },
              { label: '複習中', value: stats.statusCounts.reviewing, className: 'bg-accent-500' },
              { label: '已精熟', value: stats.statusCounts.mastered, className: 'bg-emerald-500' },
            ]}
          />
        </Card>

        <Card className="p-5">
          <SectionHeading hint={`連續學習 ${stats.currentStreakDays} 天`}>
            近 14 天活動
          </SectionHeading>
          <ActivityChart data={stats.recentActivity} />
        </Card>

        <Card className="p-5">
          <SectionHeading>依 CEFR 等級的正確率</SectionHeading>
          {(['B2', 'C1', 'C2'] as const).map((level) => (
            <AccuracyBar
              key={level}
              label={level}
              attempts={stats.accuracyByCefr[level].attempts}
              correct={stats.accuracyByCefr[level].correct}
            />
          ))}
        </Card>

        <Card className="p-5">
          <SectionHeading>依題型的正確率</SectionHeading>
          {typeRows.length === 0 ? (
            <p className="text-sm text-ink-500">
              尚無題型統計資料。登入後完成測驗，就會開始累積。
            </p>
          ) : (
            typeRows.map((row) => (
              <AccuracyBar
                key={row.type}
                label={questionTypeLabelZh[row.type]}
                attempts={row.bucket?.attempts ?? 0}
                correct={row.bucket?.correct ?? 0}
              />
            ))
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading hint="弱點分數由高到低">最需要加強的字彙</SectionHeading>
          {weak.length === 0 ? (
            <EmptyState
              title="還沒有弱點資料"
              description="完成幾份測驗後，這裡會列出最需要複習的字彙。"
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
                    錯 {row.progress.mistakeCount} 次 · 分數 {row.score.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading hint="正確率與連續答對次數">掌握最好的字彙</SectionHeading>
          {strong.length === 0 ? (
            <p className="text-sm text-ink-500">尚無足夠的作答紀錄。</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {strong.map((row) => (
                <li key={row.entry.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    to={`/words/${row.entry.slug}`}
                    lang="en"
                    className="text-sm font-medium text-ink-900 hover:underline"
                  >
                    {row.entry.lemma}
                  </Link>
                  <span className="text-xs text-ink-500 tabular-nums">
                    {row.progress.correctAnswers}/{row.progress.quizAttempts} · 連續{' '}
                    {row.progress.reviewStreak}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
