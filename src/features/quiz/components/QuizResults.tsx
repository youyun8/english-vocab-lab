import { Link } from 'react-router-dom';

import { Badge, Button, Card, LinkButton, SectionHeading, StatTile } from '@/components/ui';
import { questionTypeLabelZh, type QuestionType, type QuizSession } from '@/domain/quiz';
import { summarizeSession, type QuizBreakdownRow } from '@/services/quiz-engine';
import { useProgress } from '@/features/progress/progress-context';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';

function BreakdownTable({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: QuizBreakdownRow[];
  labelFor: (key: string) => string;
}) {
  if (rows.length === 0) return null;

  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <table className="w-full text-left text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">類別</th>
            <th scope="col">正確 / 作答</th>
            <th scope="col">正確率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const pct = row.attempts === 0 ? 0 : Math.round((row.correct / row.attempts) * 100);
            return (
              <tr key={row.key} className="border-b border-ink-100 last:border-b-0">
                <th scope="row" className="py-2 pr-3 font-normal text-ink-700">
                  {labelFor(row.key)}
                </th>
                <td className="py-2 pr-3 text-ink-500 tabular-nums">
                  {row.correct}/{row.attempts}
                </td>
                <td className="w-32 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-200">
                      <div
                        className="h-full bg-ink-800"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs text-ink-500 tabular-nums">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QuizResults({
  session,
  onRetry,
  onNewQuiz,
}: {
  session: QuizSession;
  onRetry: () => void;
  onNewQuiz: () => void;
}) {
  const summary = summarizeSession(session);
  const { byId } = useVocabulary();
  const { get } = useProgress();

  const missed = summary.missedWordIds
    .map((id) => byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const nowDue = missed.filter((entry) => {
    const progress = get(entry.id);
    return progress.nextReviewAt != null;
  });

  const newlyDifficult = missed.filter((entry) => get(entry.id).difficult);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">測驗結果</h1>
        <p className="mt-1 text-sm text-ink-500">
          答對 {summary.correct} 題，答錯 {summary.incorrect} 題。
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="正確率" value={`${summary.percentage}%`} tone="accent" />
        <StatTile label="總題數" value={summary.total} />
        <StatTile label="答對" value={summary.correct} tone="success" />
        <StatTile label="答錯" value={summary.incorrect} tone="danger" />
      </dl>

      <Card className="space-y-6 p-5">
        <BreakdownTable title="依 CEFR 等級" rows={summary.byCefr} labelFor={(key) => key} />
        <BreakdownTable
          title="依題型"
          rows={summary.byType}
          labelFor={(key) => questionTypeLabelZh[key as QuestionType] ?? key}
        />
      </Card>

      {summary.byType.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <SectionHeading>最強項目</SectionHeading>
            <ul className="flex flex-wrap gap-1.5">
              {summary.strongestCategories.map((row) => (
                <li key={row.key}>
                  <Badge tone="success">
                    {questionTypeLabelZh[row.key as QuestionType] ?? row.key}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <SectionHeading>最弱項目</SectionHeading>
            <ul className="flex flex-wrap gap-1.5">
              {summary.weakestCategories.map((row) => (
                <li key={row.key}>
                  <Badge tone="warning">
                    {questionTypeLabelZh[row.key as QuestionType] ?? row.key}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {missed.length > 0 ? (
        <Card className="p-5">
          <SectionHeading hint={`${missed.length} 個字`}>答錯的字彙</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {missed.map((entry) => (
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

          <div className="mt-4 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
            <p>已排入複習排程：{nowDue.length} 個字</p>
            <p>自動標記為困難：{newlyDifficult.length} 個字</p>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-emerald-700">全部答對，這一輪沒有需要補強的字彙。</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onNewQuiz}>
          新的測驗
        </Button>
        <Button variant="secondary" onClick={onRetry}>
          再做一次相同條件
        </Button>
        <LinkButton to="/review" variant="secondary">
          複習錯題
        </LinkButton>
        <LinkButton to="/stats" variant="ghost">
          查看學習分析
        </LinkButton>
      </div>
    </div>
  );
}
