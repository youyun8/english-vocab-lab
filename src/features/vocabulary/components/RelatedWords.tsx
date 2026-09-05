import { Link } from 'react-router-dom';

import { SectionHeading } from '@/components/ui';
import type { ConfusedWord, RelatedWord, WordFamilyItem } from '@/domain/vocabulary';
import { partOfSpeechLabelZh } from '@/domain/vocabulary';
import { useVocabulary } from '@/features/vocabulary/vocabulary-context';

/** Links to another entry when it exists in the corpus, plain text otherwise. */
function WordLink({ lemma, wordId }: { lemma: string; wordId?: string }) {
  const { byId } = useVocabulary();
  const target = wordId ? byId.get(wordId) : undefined;

  if (!target) {
    return (
      <span lang="en" className="font-medium text-ink-800">
        {lemma}
      </span>
    );
  }
  return (
    <Link
      to={`/words/${target.slug}`}
      lang="en"
      className="font-medium text-accent-600 underline decoration-accent-100 underline-offset-2 hover:decoration-accent-600"
    >
      {lemma}
    </Link>
  );
}

export function RelatedWordList({
  title,
  words,
}: {
  title: string;
  words: RelatedWord[] | undefined;
}) {
  if (!words || words.length === 0) return null;

  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <ul className="space-y-1.5">
        {words.map((word) => (
          <li key={word.lemma} className="text-sm">
            <WordLink lemma={word.lemma} {...(word.wordId ? { wordId: word.wordId } : {})} />
            {word.noteZh ? <span className="ml-2 text-ink-500">{word.noteZh}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WordFamilyList({ items }: { items: WordFamilyItem[] | undefined }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <SectionHeading>詞族 · Word family</SectionHeading>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={`${item.lemma}-${item.partOfSpeech}`} className="text-sm">
            <span lang="en" className="font-medium text-ink-800">
              {item.lemma}
            </span>
            <span className="ml-2 text-xs text-ink-400">
              {partOfSpeechLabelZh[item.partOfSpeech]}
            </span>
            {item.meaningZh ? <span className="ml-2 text-ink-500">{item.meaningZh}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Confusing-word comparisons get a table so the contrast between the headword
 * and each near-neighbour is scannable.
 */
export function ConfusedWordTable({
  lemma,
  words,
}: {
  lemma: string;
  words: ConfusedWord[] | undefined;
}) {
  if (!words || words.length === 0) return null;

  return (
    <section aria-labelledby="confusing-words">
      <SectionHeading id="confusing-words">易混淆字 · Commonly confused with</SectionHeading>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">{lemma} 與相似字詞的差異比較</caption>
          <thead>
            <tr className="border-b border-ink-200 text-xs tracking-wide text-ink-500 uppercase">
              <th scope="col" className="w-40 py-2 pr-4 font-medium">
                比較對象
              </th>
              <th scope="col" className="py-2 font-medium">
                關鍵差異
              </th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => (
              <tr key={word.lemma} className="border-b border-ink-100 align-top last:border-b-0">
                <th scope="row" className="py-3 pr-4 font-normal">
                  <span lang="en" className="text-ink-500">
                    {lemma}
                  </span>
                  <span className="mx-1 text-ink-300">vs</span>
                  <WordLink
                    lemma={word.lemma}
                    {...(word.wordId ? { wordId: word.wordId } : {})}
                  />
                </th>
                <td className="py-3 leading-relaxed text-ink-700">{word.distinctionZh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
