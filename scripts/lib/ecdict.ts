import * as OpenCC from 'opencc-js';
import type { PartOfSpeech, VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary';

export const ECDICT_REVISION = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b';
export const ECDICT_SHA256 = '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf';
export interface DictionaryRow {
  word: string;
  definition: string;
  translation: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
}
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' });
const posMap: Record<string, PartOfSpeech> = {
  n: 'noun', v: 'verb', vt: 'verb', vi: 'verb', a: 'adjective', adj: 'adjective',
  s: 'adjective', r: 'adverb', adv: 'adverb',
};

/** Keep bilingual gloss groups aligned by POS, not by an invented sense alignment. */
export function glossGroups(text: string, chinese = false): Map<PartOfSpeech, string[]> {
  const groups = new Map<PartOfSpeech, string[]>();
  for (const line of text.split(/\\n|\r?\n/)) {
    const match = /^(n|v|vt|vi|a|adj|s|r|adv)\.?\s+(.+)$/.exec(line.trim());
    if (!match) continue; // Exclude unlabelled, specialist-domain and malformed lines.
    const pos = posMap[match[1]!];
    if (!pos) continue;
    let gloss = match[2]!.trim();
    if (/\[|\]|[<>]|\\|\b(?:archaic|obsolete|offensive|slur)\b/i.test(gloss)) continue;
    if (chinese) {
      gloss = toTraditional(gloss).replace(/[,，]\s*/g, '；').replace(/;\s*/g, '；');
      if (!/[\u3400-\u9fff]/.test(gloss) || gloss.length > 100) continue;
    } else {
      if (gloss.length < 12 || gloss.length > 300 || /[\u3400-\u9fff]/.test(gloss)) continue;
      if (/^(?:plural|past|present participle|third.person|alternative|variant|same as|see\b)/i.test(gloss)) continue;
      gloss = gloss.replace(/;?\s*[`"].*$/, '').trim();
      if (gloss.length < 12) continue;
      if (/\b(?:United States|English|French|German|Italian|American|British) (?:politician|poet|writer|composer|actor|actress|painter|physicist|chemist|general|singer|novelist)|\b(?:1[4-9]\d{2}|20\d{2})\b/.test(gloss)) continue;
    }
    const values = groups.get(pos) ?? [];
    if (!values.includes(gloss)) values.push(gloss);
    groups.set(pos, values);
  }
  return groups;
}

export function frequencyRank(row: DictionaryRow): number {
  const ranks = [Number(row.bnc), Number(row.frq)].filter((n) => n > 0);
  return ranks.length ? Math.min(...ranks) : 100_000;
}

export function dictionaryEntry(row: DictionaryRow, kk: string): VocabularyEntry | null {
  const english = glossGroups(row.definition);
  const chinese = glossGroups(row.translation, true);
  const senses: VocabularySense[] = [];
  // Translation order is generally the common learner POS; WordNet order often isn't.
  for (const [partOfSpeech, zh] of chinese) {
    const en = english.get(partOfSpeech);
    if (!en?.length) continue;
    senses.push({
      id: `s_${row.word}_${partOfSpeech}`,
      partOfSpeech,
      definitionEn: en.join('; '),
      definitionZh: [...new Set(zh.flatMap((g) => g.split('；')))].join('；'),
      examples: [],
    });
  }
  if (!senses.length) return null;
  const rank = frequencyRank(row);
  return {
    id: `w_${row.word}`, lemma: row.word, slug: row.word,
    // Sorting bands only: frequency cannot establish an official CEFR level.
    cefr: rank <= 5000 ? 'B2' : rank <= 12000 ? 'C1' : 'C2',
    pronunciation: { kk }, senses,
    tags: ['dictionary', ...['toefl', 'gre'].filter((tag) => row.tag.split(' ').includes(tag))],
    dictionarySource: { name: 'ECDICT', revision: ECDICT_REVISION, license: 'MIT', cefrEstimated: true },
  };
}
