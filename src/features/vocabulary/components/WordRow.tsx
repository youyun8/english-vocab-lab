import { Link } from 'react-router-dom';

import { Badge, Card } from '@/components/ui';
import { accuracy, type WordProgress } from '@/domain/progress';
import { partOfSpeechLabelZh, type VocabularySummary } from '@/domain/vocabulary';

import { LearningStatusBadge } from './WordStatusControls';
import { Phonetic } from './Phonetic';

interface WordRowProps {
  /** Index record: a row never needs the full entry behind it. */
  word: VocabularySummary;
  progress: WordProgress;
}

function Flags({ progress }: { progress: WordProgress }) {
  return (
    <>
      {progress.bookmarked ? (
        <Badge tone="accent">
          <span aria-hidden="true">★</span>
          <span className="ml-1">收藏</span>
        </Badge>
      ) : null}
      {progress.difficult ? (
        <Badge tone="danger">
          <span aria-hidden="true">⚑</span>
          <span className="ml-1">困難</span>
        </Badge>
      ) : null}
    </>
  );
}

export function WordListRow({ word, progress }: WordRowProps) {

  return (
    <tr className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50">
      <th scope="row" className="py-3 pr-4 text-left font-normal align-top">
        <Link
          to={`/words/${word.slug}`}
          lang="en"
          className="font-medium text-ink-900 underline decoration-transparent underline-offset-2 hover:decoration-ink-400"
        >
          {word.lemma}
        </Link>
        <div className="mt-0.5">
          <Phonetic kk={word.kk} className="text-xs" />
        </div>
      </th>
      <td className="hidden py-3 pr-4 align-top text-xs text-ink-500 sm:table-cell">
        {word.partsOfSpeech.map((pos) => partOfSpeechLabelZh[pos]).join('、')}
      </td>
      <td className="py-3 pr-4 align-top">
        <Badge tone="neutral">{word.cefr}</Badge>
      </td>
      <td className="py-3 pr-4 align-top text-sm text-ink-600">{word.meaningZh}</td>
      <td className="py-3 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <LearningStatusBadge progress={progress} />
          <Flags progress={progress} />
          {progress.quizAttempts > 0 ? (
            <span className="text-xs text-ink-400 tabular-nums">
              {Math.round(accuracy(progress) * 100)}%
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function WordCard({ word, progress }: WordRowProps) {

  return (
    <Card className="flex h-full flex-col p-4 transition-colors hover:border-ink-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/words/${word.slug}`}
            lang="en"
            className="text-base font-semibold text-ink-900 underline decoration-transparent underline-offset-2 hover:decoration-ink-400"
          >
            {word.lemma}
          </Link>
          <div className="mt-0.5">
            <Phonetic kk={word.kk} className="text-xs" />
          </div>
        </div>
        <Badge tone="neutral">{word.cefr}</Badge>
      </div>

      <p className="mt-2 text-xs text-ink-400">
        {word.partsOfSpeech.map((pos) => partOfSpeechLabelZh[pos]).join('、')}
      </p>
      <p className="mt-2 flex-1 text-sm text-ink-600">{word.meaningZh}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <LearningStatusBadge progress={progress} />
        <Flags progress={progress} />
      </div>
    </Card>
  );
}
