import { Badge, Button } from '@/components/ui';
import { learningStatusLabelZh, type WordProgress } from '@/domain/progress';
import { useProgress } from '@/features/progress/progress-context';

const statusTone = {
  new: 'muted',
  learning: 'warning',
  reviewing: 'accent',
  mastered: 'success',
} as const;

export function LearningStatusBadge({ progress }: { progress: WordProgress }) {
  return (
    <Badge tone={statusTone[progress.status]}>{learningStatusLabelZh[progress.status]}</Badge>
  );
}

/** Bookmark / difficult toggles. State is conveyed by text, not colour alone. */
export function WordStatusControls({ wordId }: { wordId: string }) {
  const { get, toggleBookmark, toggleDifficult } = useProgress();
  const progress = get(wordId);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={progress.bookmarked ? 'primary' : 'secondary'}
        aria-pressed={progress.bookmarked}
        onClick={() => void toggleBookmark(wordId)}
      >
        <span aria-hidden="true">{progress.bookmarked ? '★' : '☆'}</span>
        {progress.bookmarked ? '已收藏' : '收藏'}
      </Button>
      <Button
        size="sm"
        variant={progress.difficult ? 'primary' : 'secondary'}
        aria-pressed={progress.difficult}
        onClick={() => void toggleDifficult(wordId)}
      >
        <span aria-hidden="true">⚑</span>
        {progress.difficult ? '已標為困難' : '標為困難'}
      </Button>
    </div>
  );
}
