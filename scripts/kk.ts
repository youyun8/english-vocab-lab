#!/usr/bin/env tsx
/**
 * Proposes KK transcriptions for headwords, from the CMU Pronouncing Dictionary.
 *
 *   npm run kk -- consolidate eliminate paradigm
 *
 * Use this when adding a vocabulary entry: paste the suggested transcription
 * into the JSON, then let `npm run verify:kk` check the whole corpus. The output
 * is a proposal, not gospel — CMUdict holds one pronunciation per word, and a
 * headword whose entry teaches a different part of speech may need a different
 * form (see `scripts/lib/kk-exceptions.ts`).
 */
import { dictionary } from 'cmu-pronouncing-dictionary';

import { kkFromArpabet, parseArpabet, syllabify } from './lib/kk';

const lookup = dictionary as Record<string, string | undefined>;
const words = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));

if (words.length === 0) {
  console.error('usage: npm run kk -- <word> [word …]');
  process.exit(2);
}

let missing = 0;

for (const word of words) {
  const arpabet = lookup[word.toLowerCase()];

  if (!arpabet) {
    missing += 1;
    console.log(`${word.padEnd(18)} NOT IN CMUDICT — transcribe by hand and document it`);
    continue;
  }

  const syllables = syllabify(parseArpabet(arpabet));
  const breakdown = syllables
    .map((syllable) => `${syllable.onset.join('')}${syllable.nucleus}${syllable.coda.join('')}`)
    .join('·');

  console.log(
    `${word.padEnd(18)} ${kkFromArpabet(arpabet).padEnd(26)} ${String(syllables.length).padStart(2)} syl  ${breakdown}`,
  );
}

process.exit(missing > 0 ? 1 : 0);
