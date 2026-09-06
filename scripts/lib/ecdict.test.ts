import { describe, expect, it } from 'vitest';
import { dictionaryEntry, glossGroups, type DictionaryRow } from './ecdict';

const row: DictionaryRow = {
  word: 'hypothesis', definition: 'n. a proposed explanation for observations',
  translation: 'n. 假设\\n[化] 假设', tag: 'toefl gre', bnc: '3265', frq: '3377', exchange: 's:hypotheses',
};

describe('ECDICT conversion', () => {
  it('converts actual and escaped newlines and Taiwanese Traditional Chinese', () => {
    expect(glossGroups('n. 实验\\nv. 假设\n[医] 不应导入', true)).toEqual(new Map([
      ['noun', ['實驗']], ['verb', ['假設']],
    ]));
  });

  it('matches translations to the same POS instead of pairing unrelated lines', () => {
    const entry = dictionaryEntry({ ...row, definition: 'v. offer an explanation\\nn. a proposed explanation for observations' }, '/haɪˈpɑθəsəs/');
    expect(entry?.senses).toHaveLength(1);
    expect(entry?.senses[0]).toMatchObject({ partOfSpeech: 'noun', definitionZh: '假設', examples: [] });
    expect(entry?.dictionarySource?.cefrEstimated).toBe(true);
  });

  it('rejects an entry with no usable bilingual POS match', () => {
    expect(dictionaryEntry({ ...row, definition: 'v. offer an explanation' }, '/test/')).toBeNull();
    expect(dictionaryEntry({ ...row, definition: '' }, '/test/')).toBeNull();
  });

  it('does not turn specialist annotations or inflection pointers into definitions', () => {
    expect(glossGroups('[医] a specialist gloss\\nn. plural of example\\nv. <malformed>')).toEqual(new Map());
  });
});
