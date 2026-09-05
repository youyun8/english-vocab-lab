import { Badge, SectionHeading } from '@/components/ui';
import {
  partOfSpeechLabelZh,
  registerLabelZh,
  type VocabularySense,
} from '@/domain/vocabulary';

import { CollocationList } from './Collocations';
import { CommonMistakeList } from './CommonMistakes';
import { ExampleSentenceView } from './ExampleSentence';
import { GrammarPatternList } from './GrammarPatterns';

export function SenseSection({
  sense,
  index,
  showChinese,
}: {
  sense: VocabularySense;
  index: number;
  showChinese: boolean;
}) {
  return (
    <section
      aria-labelledby={`sense-${sense.id}`}
      className="border-t border-ink-200 pt-6 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-400 tabular-nums">{index + 1}.</span>
        <Badge tone="accent">{partOfSpeechLabelZh[sense.partOfSpeech]}</Badge>
        <span lang="en" className="text-xs text-ink-500 italic">
          {sense.partOfSpeech}
        </span>
        {(sense.register ?? []).map((register) => (
          <Badge key={register} tone="muted">
            {registerLabelZh[register]}
          </Badge>
        ))}
      </div>

      <h3 id={`sense-${sense.id}`} lang="en" className="mt-3 text-base leading-relaxed text-ink-900">
        {sense.definitionEn}
      </h3>

      {showChinese ? (
        <p className="mt-1 text-base font-medium text-ink-700">{sense.definitionZh}</p>
      ) : null}

      {showChinese ? (
        <div className="mt-4 rounded-md bg-ink-100/70 px-4 py-3">
          <h4 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">用法解析</h4>
          <p className="mt-1.5 text-sm leading-7 text-ink-700">{sense.usageExplanationZh}</p>
        </div>
      ) : null}

      {sense.grammarPatterns && sense.grammarPatterns.length > 0 ? (
        <div className="mt-5">
          <SectionHeading>文法句型 · Grammar patterns</SectionHeading>
          <GrammarPatternList patterns={sense.grammarPatterns} />
        </div>
      ) : null}

      {sense.collocations && sense.collocations.length > 0 ? (
        <div className="mt-5">
          <SectionHeading>常見搭配 · Collocations</SectionHeading>
          <CollocationList collocations={sense.collocations} showChinese={showChinese} />
        </div>
      ) : null}

      <div className="mt-5">
        <SectionHeading>例句 · Examples</SectionHeading>
        <ul className="space-y-3">
          {sense.examples.map((example) => (
            <ExampleSentenceView
              key={example.en}
              example={example}
              showChinese={showChinese}
            />
          ))}
        </ul>
      </div>

      {sense.usageNotes && sense.usageNotes.length > 0 ? (
        <div className="mt-5">
          <SectionHeading>使用注意 · Usage notes</SectionHeading>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-600">
            {sense.usageNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {sense.commonMistakes && sense.commonMistakes.length > 0 ? (
        <div className="mt-5">
          <SectionHeading>常見錯誤 · Common mistakes</SectionHeading>
          <CommonMistakeList mistakes={sense.commonMistakes} />
        </div>
      ) : null}
    </section>
  );
}
