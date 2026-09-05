import { cn } from '@/utils/cn';

/**
 * CSS/SVG charts only — a charting library would add far more weight than these
 * few simple visualisations justify.
 */

export function AccuracyBar({
  label,
  attempts,
  correct,
  tone = 'default',
}: {
  label: string;
  attempts: number;
  correct: number;
  tone?: 'default' | 'muted';
}) {
  const pct = attempts === 0 ? 0 : Math.round((correct / attempts) * 100);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 truncate text-sm text-ink-600">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded bg-ink-200"
        role="img"
        aria-label={`${label}：正確率 ${pct}%，答對 ${correct} 題，共 ${attempts} 題`}
      >
        <div
          className={cn('h-full transition-all', tone === 'muted' ? 'bg-ink-400' : 'bg-ink-800')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-ink-500 tabular-nums">
        {pct}% ({correct}/{attempts})
      </span>
    </div>
  );
}

export interface ActivityDatum {
  date: string;
  answered: number;
  correct: number;
}

/** A compact 14-day column chart drawn with plain divs. */
export function ActivityChart({ data }: { data: ActivityDatum[] }) {
  const max = Math.max(1, ...data.map((point) => point.answered));

  return (
    <div>
      <ol className="flex h-28 items-end gap-1" aria-hidden="true">
        {data.map((point) => {
          const height = (point.answered / max) * 100;
          const correctHeight =
            point.answered === 0 ? 0 : (point.correct / point.answered) * height;
          return (
            <li key={point.date} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="relative w-full rounded-t bg-ink-300"
                style={{ height: `${Math.max(height, point.answered > 0 ? 4 : 1)}%` }}
                title={`${point.date}：作答 ${point.answered} 題，答對 ${point.correct} 題`}
              >
                <div
                  className="absolute bottom-0 w-full rounded-t bg-ink-800"
                  style={{ height: `${(correctHeight / Math.max(height, 1)) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-1.5 flex justify-between text-xs text-ink-400">
        <span>{data[0]?.date ?? ''}</span>
        <span>{data[data.length - 1]?.date ?? ''}</span>
      </div>
      <table className="sr-only">
        <caption>近期作答活動</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">作答題數</th>
            <th scope="col">答對題數</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point.answered}</td>
              <td>{point.correct}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-400">
        深色為答對題數，淺色為總作答題數。
      </p>
    </div>
  );
}

/** Horizontal proportion bar for the four learning statuses. */
export function StatusBar({
  counts,
}: {
  counts: { label: string; value: number; className: string }[];
}) {
  const total = counts.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded bg-ink-100">
        {counts.map((item) => (
          <div
            key={item.label}
            className={item.className}
            style={{ width: `${(item.value / total) * 100}%` }}
            title={`${item.label}：${item.value}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        {counts.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', item.className)} aria-hidden="true" />
            {item.label}
            <span className="tabular-nums text-ink-400">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
