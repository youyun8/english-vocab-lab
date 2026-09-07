import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge, Card, LinkButton, SectionHeading, Spinner } from '@/components/ui';
import { accuracy } from '@/domain/progress';
import { partOfSpeechLabelZh, primaryPartsOfSpeech } from '@/domain/vocabulary';
import { useProgress } from '@/features/progress/progress-context';
import { useSettings } from '@/features/settings/settings-context';
import { Phonetic } from '@/features/vocabulary/components/Phonetic';
import { PronounceButton } from '@/features/vocabulary/components/PronounceButton';
import {
  ConfusedWordTable,
  RelatedWordList,
  WordFamilyList,
} from '@/features/vocabulary/components/RelatedWords';
import { SenseSection } from '@/features/vocabulary/components/SenseSection';
import {
  LearningStatusBadge,
  WordStatusControls,
} from '@/features/vocabulary/components/WordStatusControls';
import { useVocabularyEntry } from '@/features/vocabulary/vocabulary-context';
import { useWordShortcuts } from '@/features/vocabulary/hooks/use-word-shortcuts';
import { NotFoundPage } from './NotFoundPage';

export function WordDetailPage() {
  const { slug = '' } = useParams();
  // The full entry lives in one chunk of the corpus, fetched on demand.
  const { entry, loading, missing } = useVocabularyEntry(slug);
  const { get, recordSeen, toggleBookmark } = useProgress();
  const { settings } = useSettings();

  const seenRef = useRef<string | null>(null);

  // Opening a word counts as studying it, but only once per mount per word.
  useEffect(() => {
    if (!entry || seenRef.current === entry.id) return;
    seenRef.current = entry.id;
    void recordSeen(entry.id);
  }, [entry, recordSeen]);

  useWordShortcuts({
    enabled: settings.keyboardShortcutsEnabled && entry != null,
    lemma: entry?.lemma ?? '',
    onBookmark: () => {
      if (entry) void toggleBookmark(entry.id);
    },
  });

  const forms = useMemo(() => Object.entries(entry?.forms ?? {}), [entry]);

  if (missing) return <NotFoundPage />;
  if (loading || !entry) return <Spinner label="載入字彙" />;

  const progress = get(entry.id);
  const pos = primaryPartsOfSpeech(entry);

  return (
    <article className="space-y-6">
      <nav aria-label="麵包屑" className="text-xs text-ink-500">
        <Link to="/words" className="underline hover:text-ink-800">
          字彙庫
        </Link>
        <span className="mx-1.5 text-ink-300">/</span>
        <span lang="en">{entry.lemma}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5">
        <div className="min-w-0">
          <h1 lang="en" className="text-3xl font-semibold tracking-tight text-ink-900">
            {entry.lemma}
          </h1>
          <p className="mt-1.5 text-lg">
            <Phonetic kk={entry.pronunciation.kk} />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pos.map((p) => (
              <Badge key={p} tone="accent">
                {partOfSpeechLabelZh[p]}
              </Badge>
            ))}
            <Badge tone="neutral">{entry.cefr}</Badge>
            <LearningStatusBadge progress={progress} />
            {progress.quizAttempts > 0 ? (
              <span className="text-xs text-ink-500 tabular-nums">
                測驗正確率 {Math.round(accuracy(progress) * 100)}%（{progress.correctAnswers}/
                {progress.quizAttempts}）
              </span>
            ) : null}
          </div>
          {entry.pronunciation.stressNote ? (
            <p className="mt-2 text-xs text-ink-500">{entry.pronunciation.stressNote}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <PronounceButton text={entry.lemma} size="md" />
          <WordStatusControls wordId={entry.id} />
        </div>
      </header>

      {entry.dictionarySource ? (
        <Card className="p-4 text-sm leading-7 text-ink-600">
          <p>字典擴充詞條：適合字義辨識與複習，尚未附上人工編寫的例句與用法解析。
            中英文釋義依詞性彙整，各義項不一定逐一對應。</p>
          <p>TOEFL／GRE／IELTS 標籤來自來源字典，並非官方必考清單；CEFR 為依詞頻估計的學習分組。</p>
          <p>釋義來源：<a className="underline" href={`https://github.com/skywind3000/ECDICT/tree/${entry.dictionarySource.revision}`}>ECDICT</a>
            {' · '}<a className="underline" href="/licenses/ECDICT-MIT.txt">MIT 授權</a>。繁體中文經自動轉換，尚未逐條人工校訂。</p>
        </Card>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-8">
          {entry.senses.map((sense, index) => (
            <SenseSection
              key={sense.id}
              sense={sense}
              index={index}
              showChinese={settings.showChineseByDefault}
            />
          ))}

          <ConfusedWordTable lemma={entry.lemma} words={entry.commonlyConfusedWith} />
        </div>

        <aside className="space-y-6 lg:border-l lg:border-ink-200 lg:pl-6">
          {entry.pronunciation.syllables ? (
            <div>
              <SectionHeading>音節 · Syllables</SectionHeading>
              <p lang="en" className="text-sm text-ink-700">
                {entry.pronunciation.syllables}
              </p>
            </div>
          ) : null}

          {forms.length > 0 ? (
            <div>
              <SectionHeading>詞形變化 · Forms</SectionHeading>
              <dl className="space-y-1 text-sm">
                {forms.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{formLabels[key] ?? key}</dt>
                    <dd lang="en" className="font-medium text-ink-800">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <RelatedWordList title="同義詞 · Synonyms" words={entry.synonyms} />
          <RelatedWordList title="反義詞 · Antonyms" words={entry.antonyms} />
          <WordFamilyList items={entry.wordFamily} />

          <div>
            <SectionHeading>標籤 · Tags</SectionHeading>
            <ul className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <li key={tag}>
                  <Badge tone="muted">{tag}</Badge>
                </li>
              ))}
            </ul>
          </div>

          <Card className="p-4">
            <SectionHeading>接下來</SectionHeading>
            <div className="flex flex-col gap-2">
              <LinkButton to="/quiz" size="sm" variant="secondary" className="w-full">
                用測驗檢驗這些字
              </LinkButton>
              <LinkButton to="/review" size="sm" variant="ghost" className="w-full">
                前往複習佇列
              </LinkButton>
            </div>
            {settings.keyboardShortcutsEnabled ? (
              <p className="mt-3 text-xs text-ink-400">
                鍵盤快捷鍵：<kbd className="rounded border border-ink-300 px-1">Space</kbd> 發音、
                <kbd className="rounded border border-ink-300 px-1">B</kbd> 收藏
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </article>
  );
}

const formLabels: Record<string, string> = {
  plural: '複數',
  past: '過去式',
  pastParticiple: '過去分詞',
  presentParticiple: '現在分詞',
  thirdPersonSingular: '第三人稱單數',
  comparative: '比較級',
  superlative: '最高級',
};
