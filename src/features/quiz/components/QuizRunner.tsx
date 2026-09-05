import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Card } from '@/components/ui';
import { findOption, isCorrectAnswer, type QuizSession } from '@/domain/quiz';
import { answerQuestion } from '@/services/quiz-engine';
import { isTypingTarget } from '@/features/vocabulary/hooks/use-word-shortcuts';

import { QuizFeedback } from './QuizFeedback';
import { QuizOptionButton, type OptionState } from './QuizOptionButton';

export interface QuizRunnerProps {
  session: QuizSession;
  keyboardShortcutsEnabled: boolean;
  onAnswer: (questionId: string, optionId: string, correct: boolean) => void;
  onComplete: (session: QuizSession) => void;
  onQuit: () => void;
}

export function QuizRunner({
  session: initialSession,
  keyboardShortcutsEnabled,
  onAnswer,
  onComplete,
  onQuit,
}: QuizRunnerProps) {
  const [session, setSession] = useState(initialSession);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const question = session.questions[index];
  const total = session.questions.length;
  const isLast = index === total - 1;

  const select = useCallback(
    (optionId: string) => {
      if (selected || !question) return;
      setSelected(optionId);
      const { session: next, record } = answerQuestion(session, question.id, optionId, new Date());
      setSession(next);
      onAnswer(question.id, optionId, record.correct);
    },
    [selected, question, session, onAnswer],
  );

  const advance = useCallback(() => {
    if (!selected) return;
    if (isLast) {
      onComplete({ ...session, completedAt: new Date().toISOString() });
      return;
    }
    setIndex((current) => current + 1);
    setSelected(null);
  }, [selected, isLast, onComplete, session]);

  /**
   * 1–4 pick an answer, Enter advances. Shortcuts never fire while a form
   * control has focus, and never once an answer is already locked in.
   */
  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'Enter') {
        event.preventDefault();
        advance();
        return;
      }

      const digit = Number.parseInt(event.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 4 && question) {
        const option = question.options[digit - 1];
        if (option && !selected) {
          event.preventDefault();
          select(option.id);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardShortcutsEnabled, advance, select, question, selected]);

  const optionState = useMemo(() => {
    return (optionId: string): OptionState => {
      if (!selected || !question) return 'idle';
      if (optionId === selected) {
        return isCorrectAnswer(question, optionId) ? 'correct' : 'incorrect';
      }
      if (optionId === question.correctOptionId) return 'revealed-correct';
      return 'idle';
    };
  }, [selected, question]);

  if (!question) return null;

  const answeredCorrectly = selected ? isCorrectAnswer(question, selected) : false;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500 tabular-nums">
          第 {index + 1} / {total} 題
        </p>
        <Button size="sm" variant="ghost" onClick={onQuit}>
          結束測驗
        </Button>
      </div>

      <div
        className="mb-5 h-1 w-full overflow-hidden rounded bg-ink-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index + (selected ? 1 : 0)}
        aria-label="測驗進度"
      >
        <div
          className="h-full bg-ink-900 transition-all"
          style={{ width: `${((index + (selected ? 1 : 0)) / total) * 100}%` }}
        />
      </div>

      <Card className="p-5">
        <h2 className="text-base font-medium text-ink-900">{question.prompt}</h2>
        {question.context ? (
          <p
            lang={question.type === 'meaning_zh_to_en' ? 'zh-Hant' : 'en'}
            className="mt-3 rounded-md bg-ink-100/70 px-4 py-3 text-sm leading-relaxed text-ink-800"
          >
            {question.context}
          </p>
        ) : null}

        <div className="mt-5 space-y-2" role="group" aria-label="答案選項">
          {question.options.map((option, optionIndex) => (
            <QuizOptionButton
              key={option.id}
              option={option}
              index={optionIndex}
              state={optionState(option.id)}
              disabled={selected != null}
              showShortcut={keyboardShortcutsEnabled}
              onSelect={() => select(option.id)}
            />
          ))}
        </div>
      </Card>

      {selected ? (
        <>
          <QuizFeedback
            question={question}
            selectedOptionId={selected}
            correct={answeredCorrectly}
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            {keyboardShortcutsEnabled ? (
              <p className="text-xs text-ink-400">
                按 <kbd className="rounded border border-ink-300 px-1">Enter</kbd> 繼續
              </p>
            ) : (
              <span />
            )}
            <Button variant="primary" size="lg" onClick={advance}>
              {isLast ? '查看結果' : '下一題'}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-xs text-ink-400">
          {keyboardShortcutsEnabled
            ? '快捷鍵：1 / 2 / 3 / 4 選擇答案，Enter 進入下一題。'
            : '選擇一個答案後會顯示詳解。'}
          {selected == null && findOption(question, question.correctOptionId) == null
            ? ' 這一題的資料有誤，請回報。'
            : ''}
        </p>
      )}
    </div>
  );
}
