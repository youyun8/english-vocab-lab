import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ErrorNotice, Spinner } from '@/components/ui';
import {
  DEFAULT_QUIZ_CONFIG,
  OPTIONS_PER_QUESTION,
  quizModes,
  type QuizConfig,
  type QuizMode,
  type QuizQuestion,
  type QuizSession,
} from '@/domain/quiz';
import { useAuth } from '@/features/auth/auth-context';
import { useProgress } from '@/features/progress/progress-context';
import { QuizConfigForm } from '@/features/quiz/components/QuizConfigForm';
import { QuizResults } from '@/features/quiz/components/QuizResults';
import { QuizRunner } from '@/features/quiz/components/QuizRunner';
import { useSettings } from '@/features/settings/settings-context';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';
import { apiFetch } from '@/services/api-client';
import { buildQuizSession, selectQuizWords } from '@/services/quiz-engine';
import { GENERATED_TYPES } from '@/services/question-generator';

type Phase = 'configure' | 'running' | 'results';

/** The configuration form only ever shows "plenty available" past this. */
const PREVIEW_LIMIT = 50;

function isQuizMode(value: string | null): value is QuizMode {
  return value != null && (quizModes as readonly string[]).includes(value);
}

export function QuizPage() {
  const { summaries, ready: indexReady, error, loadEntries, loadQuestions } = useVocabulary();
  // The curated bank is small and every quiz may draw on it; the vocabulary
  // entries are not, so they are chosen from the index first and only the
  // chunks holding the chosen words are downloaded when a quiz starts.
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [building, setBuilding] = useState(false);
  const ready = indexReady && questions != null;
  const { progress, recordOutcome } = useProgress();
  const { settings } = useSettings();
  const { status } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [phase, setPhase] = useState<Phase>('configure');
  const [session, setSession] = useState<QuizSession | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [relaxed, setRelaxed] = useState(false);

  const modeFromUrl = searchParams.get('mode');

  /**
   * The effective config is derived, not synchronised: user settings and the
   * `?mode=` link supply the baseline, and anything the learner changes on this
   * page is layered on top. This avoids an effect that mirrors props into state.
   */
  const [overrides, setOverrides] = useState<Partial<QuizConfig>>({});

  const config = useMemo<QuizConfig>(
    () => ({
      ...DEFAULT_QUIZ_CONFIG,
      questionCount: settings.questionsPerQuiz,
      cefrLevels: settings.cefrLevels,
      shuffleOptions: settings.shuffleOptions,
      ...(isQuizMode(modeFromUrl) ? { mode: modeFromUrl } : {}),
      ...overrides,
    }),
    [settings.questionsPerQuiz, settings.cefrLevels, settings.shuffleOptions, modeFromUrl, overrides],
  );

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadQuestions().catch(() => []);
      if (!cancelled) setQuestions(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQuestions]);

  /**
   * How many questions this configuration could produce, counted from the
   * index: every eligible word yields one question per generated type, plus the
   * curated questions that match. Counting beats building a preview session,
   * which would have to download the words first.
   */
  const availableCount = useMemo(() => {
    if (!ready || !questions) return 0;
    const { targetIds, poolIds } = selectQuizWords({ summaries, config, progress, now });
    if (targetIds.length + poolIds.length < OPTIONS_PER_QUESTION) return 0;
    const generatedTypes = config.questionTypes.filter((type) =>
      GENERATED_TYPES.includes(type),
    ).length;
    const curatedMatches = questions.filter(
      (question) =>
        config.cefrLevels.includes(question.cefr)
        && config.questionTypes.includes(question.type),
    ).length;
    return Math.min(PREVIEW_LIMIT, targetIds.length * generatedTypes + curatedMatches);
  }, [ready, questions, summaries, config, progress, now]);

  const start = useCallback(async () => {
    if (!questions) return;
    setBuilding(true);
    const selection = selectQuizWords({ summaries, config, progress, now: new Date() });
    const entries = await loadEntries([...selection.targetIds, ...selection.poolIds]);
    const result = buildQuizSession({
      config,
      entries,
      curatedQuestions: questions,
      progress,
      now: new Date(),
    });
    setBuilding(false);
    setSession(result.session);
    setRelaxed(result.relaxed || selection.relaxed);
    setPhase('running');
    setAttemptId(null);

    if (status === 'authenticated') {
      try {
        const created = await apiFetch<{ quizId: string }>('/api/quiz', {
          method: 'POST',
          body: JSON.stringify({ totalQuestions: result.session.questions.length }),
        });
        setAttemptId(created.quizId);
      } catch {
        // Quiz history is a nice-to-have; never block the learner on it.
        setAttemptId(null);
      }
    }
  }, [config, summaries, questions, progress, status, loadEntries]);

  const handleAnswer = useCallback(
    (questionId: string, optionId: string, correct: boolean) => {
      const question = session?.questions.find((item) => item.id === questionId);
      if (!question) return;

      // Progress and the review schedule update for every word the question
      // exercises, whichever repository is currently active.
      for (const wordId of question.wordIds) {
        void recordOutcome(wordId, correct);
      }

      if (attemptId && status === 'authenticated') {
        void apiFetch(`/api/quiz/${attemptId}/answer`, {
          method: 'POST',
          body: JSON.stringify({
            questionId,
            wordId: question.wordIds[0],
            selectedOptionId: optionId,
            correct,
            questionType: question.type,
            cefr: question.cefr,
          }),
        }).catch(() => undefined);
      }
    },
    [session, recordOutcome, attemptId, status],
  );

  const handleComplete = useCallback(
    (completed: QuizSession) => {
      setSession(completed);
      setPhase('results');

      if (attemptId && status === 'authenticated') {
        void apiFetch(`/api/quiz/${attemptId}/complete`, {
          method: 'POST',
          body: JSON.stringify({
            correctAnswers: completed.answers.filter((answer) => answer.correct).length,
          }),
        }).catch(() => undefined);
      }
    },
    [attemptId, status],
  );

  const backToConfig = useCallback(() => {
    setPhase('configure');
    setSession(null);
    setRelaxed(false);
    setOverrides({});
    if (searchParams.has('mode')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  if (error) return <ErrorNotice>{error}</ErrorNotice>;
  if (!ready) return <Spinner label="準備測驗" />;
  if (building) return <Spinner label="挑選題目" />;

  if (phase === 'running' && session) {
    return (
      <>
        {relaxed ? (
          <p className="mx-auto mb-4 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            所選模式的可用題目不足，已自動放寬為全字彙庫出題。
          </p>
        ) : null}
        <QuizRunner
          session={session}
          keyboardShortcutsEnabled={settings.keyboardShortcutsEnabled}
          onAnswer={handleAnswer}
          onComplete={handleComplete}
          onQuit={backToConfig}
        />
      </>
    );
  }

  if (phase === 'results' && session) {
    return (
      <QuizResults
        session={session}
        onRetry={() => void start()}
        onNewQuiz={backToConfig}
      />
    );
  }

  return (
    <QuizConfigForm
      config={config}
      onChange={setOverrides}
      onStart={() => void start()}
      availableCount={availableCount}
    />
  );
}
