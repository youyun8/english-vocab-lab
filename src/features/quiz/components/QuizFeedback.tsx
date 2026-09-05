import { Link } from 'react-router-dom';

import { Badge, Card } from '@/components/ui';
import { questionTypeLabelZh, type QuizQuestion } from '@/domain/quiz';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';

/** Shown after answering: why the answer is right, and why the traps are wrong. */
export function QuizFeedback({
  question,
  selectedOptionId,
  correct,
}: {
  question: QuizQuestion;
  selectedOptionId: string;
  correct: boolean;
}) {
  const { byId } = useVocabulary();
  const answer = question.options.find((option) => option.id === question.correctOptionId);
  // The learner's own wrong choice is listed first — that is the explanation
  // they most need to read.
  const distractors = Object.entries(question.distractorExplanations ?? {}).sort(
    ([a], [b]) => Number(b === selectedOptionId) - Number(a === selectedOptionId),
  );
  const relatedWords = question.wordIds
    .map((id) => byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  return (
    <Card className="mt-5 p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className={correct ? 'text-emerald-700' : 'text-red-700'}>
          {correct ? '✓ 答對了' : '✗ 答錯了'}
        </span>
        <Badge tone="muted">{questionTypeLabelZh[question.type]}</Badge>
        <Badge tone="muted">{question.cefr}</Badge>
      </p>

      {!correct && answer ? (
        <p className="mt-2 text-sm text-ink-700">
          正確答案：<strong className="text-ink-900">{answer.text}</strong>
        </p>
      ) : null}

      <p className="mt-2 text-sm leading-relaxed text-ink-700">{question.explanation}</p>

      {distractors.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-500 hover:text-ink-800">
            為什麼其他選項不對？
          </summary>
          <ul className="mt-2 space-y-1.5">
            {distractors.map(([optionId, explanation]) => {
              const option = question.options.find((item) => item.id === optionId);
              if (!option) return null;
              return (
                <li key={optionId} className="text-sm text-ink-600">
                  <span className="font-medium text-ink-800">{option.text}</span>
                  {optionId === selectedOptionId ? (
                    <span className="ml-1.5 text-xs text-red-700">（您選的答案）</span>
                  ) : null}
                  <span className="mx-1.5 text-ink-300">—</span>
                  {explanation}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {relatedWords.length > 0 ? (
        <p className="mt-3 text-xs text-ink-500">
          相關字彙：
          {relatedWords.map((entry, index) => (
            <span key={entry.id}>
              {index > 0 ? '、' : ''}
              <Link
                to={`/words/${entry.slug}`}
                lang="en"
                className="text-accent-600 underline underline-offset-2"
              >
                {entry.lemma}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </Card>
  );
}
