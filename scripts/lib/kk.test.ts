import { describe, expect, it } from 'vitest';

import { dictionary } from 'cmu-pronouncing-dictionary';

import {
  compareKk,
  extractTranscriptions,
  kkFromArpabet,
  parseArpabet,
  parseKk,
  syllabify,
  KkParseError,
} from './kk';
import { findKkException, KK_EXCEPTIONS } from './kk-exceptions';

const lookup = dictionary as Record<string, string | undefined>;

describe('parseArpabet', () => {
  it('maps consonants and stressed vowels', () => {
    expect(parseArpabet('K AE1 T').map((s) => s.kk)).toEqual(['k', 'æ', 't']);
  });

  it('reduces unstressed AH to schwa but keeps stressed AH as /ʌ/', () => {
    expect(parseArpabet('AH0').map((s) => s.kk)).toEqual(['ə']);
    expect(parseArpabet('AH1').map((s) => s.kk)).toEqual(['ʌ']);
  });

  it('distinguishes stressed /ɝ/ from unstressed /ɚ/', () => {
    expect(parseArpabet('ER1').map((s) => s.kk)).toEqual(['ɝ']);
    expect(parseArpabet('ER0').map((s) => s.kk)).toEqual(['ɚ']);
  });

  it('maps the digraph consonants', () => {
    expect(parseArpabet('CH JH SH ZH TH DH NG').map((s) => s.kk)).toEqual([
      'tʃ', 'dʒ', 'ʃ', 'ʒ', 'θ', 'ð', 'ŋ',
    ]);
  });

  it('records stress levels', () => {
    expect(parseArpabet('AA1 AA2 AA0').map((s) => s.stress)).toEqual([1, 2, 0]);
  });

  it('rejects an unknown symbol', () => {
    expect(() => parseArpabet('QQ1')).toThrow(/Unrecognised/);
  });

  it('strips the trailing "# place, danish" annotation some entries carry', () => {
    expect(parseArpabet('AO1 L B AO0 R G # place, danish').map((s) => s.kk)).toEqual([
      'ɔ', 'l', 'b', 'ɔ', 'r', 'g',
    ]);
  });
});

describe('syllabify', () => {
  it('gives one syllable per vowel', () => {
    expect(syllabify(parseArpabet('K AH0 N S AA1 L IH0 D EY2 T'))).toHaveLength(4);
  });

  it('applies the maximal onset principle within legal clusters', () => {
    // "consolidate": the /s/ goes to the second syllable, /ns/ is not a legal onset.
    const syllables = syllabify(parseArpabet('K AH0 N S AA1 L IH0 D EY2 T'));
    expect(syllables[0]).toMatchObject({ onset: ['k'], nucleus: 'ə', coda: ['n'] });
    expect(syllables[1]).toMatchObject({ onset: ['s'], nucleus: 'ɑ' });
  });

  it('keeps a legal two-consonant cluster together as an onset', () => {
    // "declare": /kl/ is a legal onset, so both consonants move right.
    const syllables = syllabify(parseArpabet('D IH0 K L EH1 R'));
    expect(syllables[1]?.onset).toEqual(['k', 'l']);
  });

  it('treats a word-initial cluster as a single onset', () => {
    expect(syllabify(parseArpabet('S K R UW1 T AH0 N IY0'))[0]?.onset).toEqual(['s', 'k', 'r']);
  });

  it('puts everything after the last vowel in the final coda', () => {
    const syllables = syllabify(parseArpabet('T EH1 K S T'));
    expect(syllables[0]?.coda).toEqual(['k', 's', 't']);
  });

  it('returns nothing for an entry with no vowel', () => {
    expect(syllabify(parseArpabet('S'))).toEqual([]);
  });
});

describe('kkFromArpabet', () => {
  it.each([
    ['K AH0 N S AA1 L IH0 D EY2 T', '/kənˈsɑlɪˌdet/'],
    ['IH0 L IH1 M AH0 N EY2 T', '/ɪˈlɪməˌnet/'],
    ['R EH1 L AH0 V AH0 N T', '/ˈrɛləvənt/'],
    ['S AH1 T AH0 L', '/ˈsʌtəl/'],
    ['IH2 N F ER1', '/ˌɪnˈfɝ/'],
    ['K R AY0 T IH1 R IY0 AH0 N', '/kraɪˈtɪriən/'],
  ])('renders %s as %s', (arpabet, expected) => {
    expect(kkFromArpabet(arpabet)).toBe(expected);
  });

  it('omits stress marks on a monosyllable', () => {
    expect(kkFromArpabet('K AE1 T')).toBe('/kæt/');
  });

  it('demotes the second primary stress of a compound to secondary', () => {
    // CMUdict marks both elements of a compound with stress 1.
    expect(kkFromArpabet('AE1 B AH0 T S T AW1 N')).toBe('/ˈæbətˌstaʊn/');
  });

  it('promotes secondary stress when CMUdict records no primary', () => {
    // "accredit" is AH0 K R EH2 D AH0 T — a polysyllable still needs a primary.
    expect(kkFromArpabet('AH0 K R EH2 D AH0 T')).toBe('/əˈkrɛdət/');
  });

  it('places the stress mark before the onset, not before the vowel', () => {
    expect(kkFromArpabet('R IH0 T EY1 N')).toBe('/rɪˈten/');
  });
});

describe('parseKk', () => {
  it('tokenises digraphs rather than splitting them', () => {
    expect(parseKk('/tʃaɪld/').phonemes).toEqual(['tʃ', 'aɪ', 'l', 'd']);
    expect(parseKk('/dʒɔɪn/').phonemes).toEqual(['dʒ', 'ɔɪ', 'n']);
  });

  it('records how many vowels precede the primary stress', () => {
    expect(parseKk('/kənˈsɑləˌdet/').primaryStressVowelOrdinal).toBe(1);
    expect(parseKk('/ˈrɛləvənt/').primaryStressVowelOrdinal).toBe(0);
  });

  it('counts secondary stress marks', () => {
    expect(parseKk('/ˌriɪnˈfɔrs/').secondaryStressCount).toBe(1);
    expect(parseKk('/ˈrɛləvənt/').secondaryStressCount).toBe(0);
  });

  it('reports -1 when there is no primary stress mark', () => {
    expect(parseKk('/kæt/').primaryStressVowelOrdinal).toBe(-1);
  });

  it('keeps the first primary mark and counts the rest', () => {
    const parsed = parseKk('/ˈæbətˈstaʊn/');
    expect(parsed.primaryStressVowelOrdinal).toBe(0);
    expect(parsed.primaryStressCount).toBe(2);
  });

  it('counts vowels', () => {
    expect(parseKk('/kənˈsɑləˌdet/').vowelCount).toBe(4);
  });

  it('rejects a symbol outside the KK inventory', () => {
    // /ɜ/ is IPA, not KK — KK uses /ɝ/.
    expect(() => parseKk('/ˈbɜrd/')).toThrow(KkParseError);
  });
});

describe('extractTranscriptions', () => {
  it('finds every transcription in a field with several', () => {
    expect(
      extractTranscriptions('/ɑrˈtɪkjəˌlet/（動詞）；/ɑrˈtɪkjəlɪt/（形容詞）'),
    ).toEqual(['/ɑrˈtɪkjəˌlet/', '/ɑrˈtɪkjəlɪt/']);
  });

  it('returns nothing when the field has no transcription', () => {
    expect(extractTranscriptions('重音在第一音節')).toEqual([]);
  });
});

describe('compareKk', () => {
  it('accepts an exact match', () => {
    expect(compareKk('/ˈrɛləvənt/', 'R EH1 L AH0 V AH0 N T').status).toBe('match');
  });

  it('treats /ɚ/ and /ə/+/r/ as the same sounds', () => {
    // Same phonetic string, syllabified differently.
    expect(compareKk('/kəˈrɑbəˌret/', 'K ER0 AA1 B ER0 EY2 T').status).toBe('match');
  });

  it('accepts /ŋ/ where CMUdict writes an unassimilated /n/ before /k/', () => {
    expect(compareKk('/ˌɪŋkˈlud/', 'IH2 N K L UW1 D').status).not.toBe('mismatch');
  });

  it('classifies the unstressed /ɪ/-for-/i/ house convention', () => {
    const result = compareKk('/dɪˈskrɛpənsɪ/', 'D IH0 S K R EH1 P AH0 N S IY0');
    expect(result.status).toBe('convention');
  });

  it('classifies a weak-vowel disagreement as a variant', () => {
    const result = compareKk('/kənˈsɑləˌdet/', 'K AH0 N S AA1 L IH0 D EY2 T');
    expect(result.status).toBe('variant');
  });

  it('rejects a wrong vowel in a stressed syllable', () => {
    const result = compareKk('/ˈpærəˌdaɪm/', 'P EH1 R AH0 D AY2 M');
    expect(result.status).toBe('mismatch');
    expect(result.notes.join(' ')).toMatch(/segment 2 differs/);
  });

  it('rejects a wrong consonant', () => {
    expect(compareKk('/ˈrɛlədənt/', 'R EH1 L AH0 V AH0 N T').status).toBe('mismatch');
  });

  it('rejects a missing phoneme', () => {
    const result = compareKk('/ˈrɛlvənt/', 'R EH1 L AH0 V AH0 N T');
    expect(result.status).toBe('mismatch');
    expect(result.notes.join(' ')).toMatch(/segment count differs/);
  });

  it('rejects stress on the wrong syllable', () => {
    const result = compareKk('/ˈkənsɑləˌdet/', 'K AH0 N S AA1 L IH0 D EY2 T');
    expect(result.status).toBe('mismatch');
    expect(result.notes.join(' ')).toMatch(/primary stress/);
  });

  it('rejects a transcription with two primary stress marks', () => {
    const result = compareKk('/ˈæbətˈstaʊn/', 'AE1 B AH0 T S T AW1 N');
    expect(result.status).toBe('mismatch');
    expect(result.notes.join(' ')).toMatch(/only one/);
  });

  it('rejects a multisyllabic transcription with no stress mark', () => {
    const result = compareKk('/kənsɑləˌdet/', 'K AH0 N S AA1 L IH0 D EY2 T');
    expect(result.status).toBe('mismatch');
    expect(result.notes.join(' ')).toMatch(/no primary stress mark/);
  });

  it('always reports the dictionary rendering for the error message', () => {
    expect(compareKk('/ˈpærəˌdaɪm/', 'P EH1 R AH0 D AY2 M').expected).toBe('/ˈpɛrəˌdaɪm/');
  });
});

describe('documented exceptions', () => {
  it('matches only the exact transcription it declares', () => {
    expect(findKkException('undermine', '/ˌʌndɚˈmaɪn/')).not.toBeNull();
    expect(findKkException('undermine', '/ˈʌndɚˌmaɪn/')).toBeNull();
    expect(findKkException('consolidate', '/ˌʌndɚˈmaɪn/')).toBeNull();
  });

  it('gives a reason for every exception', () => {
    for (const exception of KK_EXCEPTIONS) {
      expect(exception.reason.length, exception.lemma).toBeGreaterThan(40);
      expect(exception.accepted).toMatch(/^\/.+\/$/);
    }
  });

  it('only declares exceptions that CMUdict really disagrees with', () => {
    // An exception that the dictionary actually agrees with is dead weight and
    // should be deleted rather than left to rot.
    for (const exception of KK_EXCEPTIONS) {
      const arpabet = lookup[exception.lemma.toLowerCase()];
      expect(arpabet, `${exception.lemma} is not in CMUdict`).toBeTruthy();
      expect(
        compareKk(exception.accepted, arpabet as string).status,
        `${exception.lemma} no longer needs an exception`,
      ).toBe('mismatch');
    }
  });
});

describe('round trip against CMUdict', () => {
  it('renders a generated transcription that verifies against its own source', () => {
    const words = ['consolidate', 'eliminate', 'relevant', 'criterion', 'ubiquitous', 'paradigm'];
    for (const word of words) {
      const arpabet = lookup[word] as string;
      expect(compareKk(kkFromArpabet(arpabet), arpabet).status, word).toBe('match');
    }
  });

  it('never generates KK that its own verifier would reject', () => {
    // A compound comes back as `variant` rather than `match`, because CMUdict
    // marks both elements primary and the generator demotes the second — which
    // is the intended behaviour. Anything worse than that is a bug.
    const words = Object.keys(lookup)
      .filter((word) => /^[a-z]{4,12}$/.test(word))
      .slice(0, 5000);

    expect(words.length).toBeGreaterThan(1000);

    for (const word of words) {
      const arpabet = lookup[word] as string;
      const generated = kkFromArpabet(arpabet);
      expect(() => parseKk(generated), `${word}: ${generated}`).not.toThrow();
      expect(compareKk(generated, arpabet).status, `${word}: ${generated}`).not.toBe('mismatch');
    }
  });
});
