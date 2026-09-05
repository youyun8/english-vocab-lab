import { useState } from 'react';

import { Button } from '@/components/ui';
import type { MergePrompt } from './progress-context';

/**
 * Shown once, after signing in, when this browser still holds anonymous
 * progress. Nothing is merged without an explicit click — neither side of the
 * data is ever silently overwritten.
 */
export function MergePromptBanner({ prompt }: { prompt: MergePrompt }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await prompt.accept();
    } catch {
      setError('合併失敗，請稍後再試。您的本機資料並未變動。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-accent-100 bg-accent-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-accent-700">
          偵測到本機有 <strong>{prompt.localCount}</strong> 筆未同步的學習紀錄。
          要合併到您的雲端帳號嗎？（合併採用取大值規則，不會重複計算。）
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="primary" onClick={() => void accept()} disabled={busy}>
            {busy ? '合併中…' : '合併到雲端'}
          </Button>
          <Button size="sm" variant="ghost" onClick={prompt.dismiss} disabled={busy}>
            稍後再說
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mx-auto max-w-6xl px-4 pb-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
