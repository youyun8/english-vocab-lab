import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import {
  isCorrectAnswer,
  questionTypeLabelZh,
  type QuizQuestion,
} from '@/domain/quiz';
import { questionSourceLabelZh } from '@/services/question-bank';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';

import { QuizOptionButton, type OptionState } from './QuizOptionButton';

/**
 * One question as browsed in the bank.
 *
 * The options are always on screen — that is the part worth studying — but the
 * answer key stays hidden until the reader either picks an option or asks for
 * it, so scrolling the bank is practice rather than reading a solutions sheet.
 * The state lives in this component, so it resets whenever the page re-keys the
 * list (a filter change or a page turn).
 */
export function QuestionBankCard({ question }: { question: QuizQuestion }) {
  const { byId } = useVocabulary();
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const words = question.wordIds
    .map((id) => byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const answer = question.options.find((option) => option.id === question.correctOptionId);
  const answered = selected != null;
  const showAnswer = revealed || answered;

  const optionState = (optionId: string): OptionState => {
    if (!showAnswer) return 'idle';
    if (optionId === selected) {
      return isCorrectAnswer(question, optionId) ? 'correct' : 'incorrect';
    }
    if (optionId === question.correctOptionId) return 'revealed-correct';
    return 'idle';
  };

  const reset = () => {
    setSelected(null);
    setRevealed(false);
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{questionTypeLabelZh[question.type]}</Badge>
        <Badge tone="neutral">{question.cefr}</Badge>
        <Badge tone="muted">難度 {question.difficulty}</Badge>
        <Badge tone="muted">{questionSourceLabelZh[question.source]}</Badge>
        {words.map((word) => (
          <Link
            key={word.id}
            to={`/words/${word.slug}`}
            lang="en"
            className="text-xs text-accent-600 underline underline-offset-2"
          >
            {word.lemma}
          </Link>
        ))}
      </div>

      <p className="mt-2.5 text-sm font-medium text-ink-900">{question.prompt}</p>
      {question.context ? (
        <p
          lang={question.type === 'meaning_zh_to_en' ? 'zh-Hant' : 'en'}
          className="mt-2 rounded-md bg-ink-100/70 px-3 py-2 text-sm leading-relaxed text-ink-800"
        >
          {question.context}
        </p>
      ) : null}

      <div className="mt-3 space-y-2" role="group" aria-label="答案選項">
        {question.options.map((option, index) => (
          <QuizOptionButton
            key={option.id}
            option={option}
            index={index}
            state={optionState(option.id)}
            disabled={showAnswer}
            showShortcut={false}
            onSelect={() => setSelected(option.id)}
          />
        ))}
      </div>

      {showAnswer ? (
        <div className="mt-3 border-t border-ink-200 pt-3" aria-live="polite">
          <p className="text-sm text-ink-700">
            正確答案：<strong className="text-ink-900">{answer?.text}</strong>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{question.explanation}</p>

          {question.distractorExplanations ? (
            <ul className="mt-2 space-y-1">
              {Object.entries(question.distractorExplanations).map(([optionId, note]) => {
                // Options are on screen directly above, so the letter identifies
                // them without repeating a whole sentence of option text.
                const index = question.options.findIndex((item) => item.id === optionId);
                if (index < 0) return null;
                return (
                  <li key={optionId} className="text-xs text-ink-600">
                    <span className="font-medium text-ink-800">
                      選項 {String.fromCharCode(65 + index)}
                    </span>
                    <span className="mx-1.5 text-ink-300">—</span>
                    {note}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-400">
              {question.tags.length > 0 ? question.tags.join('、') : null}
            </p>
            <Button size="sm" variant="ghost" onClick={reset}>
              隱藏答案
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-400">選一個選項自我測驗，或直接查看答案。</p>
          <Button size="sm" variant="secondary" onClick={() => setRevealed(true)}>
            顯示答案
          </Button>
        </div>
      )}
    </Card>
  );
}
