/**
 * KK (Kenyon & Knott) phonetics tooling.
 *
 * KK is the American-English transcription system used throughout English
 * teaching in Taiwan. This module converts between the CMU Pronouncing
 * Dictionary's ARPABET notation and KK so that every transcription shipped in
 * the corpus can be checked against a real pronunciation database rather than
 * being taken on trust.
 *
 * Two directions are supported:
 *  - `kkFromArpabet`   proposes a KK transcription (used when adding words)
 *  - `compareKk`       verifies an existing transcription (used by the checker)
 */

// ---------------------------------------------------------------------------
// Phoneme inventory
// ---------------------------------------------------------------------------

/** ARPABET vowel -> KK, for vowels carrying primary or secondary stress. */
const STRESSED_VOWELS: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AH: 'ʌ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  ER: 'ɝ',
  EY: 'e',
  IH: 'ɪ',
  IY: 'i',
  OW: 'o',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u',
};

/**
 * Unstressed counterparts. Only AH and ER actually change symbol in KK:
 * unstressed AH is schwa, and unstressed ER is the r-coloured schwa.
 */
const UNSTRESSED_VOWELS: Record<string, string> = {
  ...STRESSED_VOWELS,
  AH: 'ə',
  ER: 'ɚ',
};

const CONSONANTS: Record<string, string> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'g',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

/** Longest-first so that digraphs tokenise before their component symbols. */
const KK_TOKENS = [
  'aɪ',
  'aʊ',
  'ɔɪ',
  'tʃ',
  'dʒ',
  'i',
  'ɪ',
  'e',
  'ɛ',
  'æ',
  'ɑ',
  'ɔ',
  'o',
  'ʊ',
  'u',
  'ʌ',
  'ə',
  'ɝ',
  'ɚ',
  'p',
  'b',
  't',
  'd',
  'k',
  'g',
  'f',
  'v',
  'θ',
  'ð',
  's',
  'z',
  'ʃ',
  'ʒ',
  'm',
  'n',
  'ŋ',
  'l',
  'r',
  'j',
  'w',
  'h',
];

const KK_VOWELS = new Set([
  'i',
  'ɪ',
  'e',
  'ɛ',
  'æ',
  'ɑ',
  'ɔ',
  'o',
  'ʊ',
  'u',
  'ʌ',
  'ə',
  'ɝ',
  'ɚ',
  'aɪ',
  'aʊ',
  'ɔɪ',
]);

export const PRIMARY_STRESS = 'ˈ';
export const SECONDARY_STRESS = 'ˌ';

export function isKkVowel(token: string): boolean {
  return KK_VOWELS.has(token);
}

// ---------------------------------------------------------------------------
// ARPABET -> KK
// ---------------------------------------------------------------------------

export interface ArpabetSegment {
  /** The KK symbol for this segment. */
  kk: string;
  vowel: boolean;
  /** 0 = unstressed, 1 = primary, 2 = secondary. Consonants are 0. */
  stress: 0 | 1 | 2;
}

/**
 * Splits a CMUdict entry such as "K AH0 N S AA1 L IH0 D EY2 T".
 *
 * Some entries carry a trailing `# place, danish` annotation, which is stripped
 * before parsing.
 */
export function parseArpabet(entry: string): ArpabetSegment[] {
  const segments: ArpabetSegment[] = [];
  const phonemesOnly = entry.split('#')[0] ?? '';

  for (const raw of phonemesOnly.trim().split(/\s+/).filter(Boolean)) {
    const match = /^([A-Z]+)([0-2])?$/.exec(raw);
    if (!match) throw new Error(`Unrecognised ARPABET symbol: ${raw}`);

    const [, symbol = '', digit] = match;

    if (digit !== undefined) {
      const stress = Number(digit) as 0 | 1 | 2;
      const table = stress === 0 ? UNSTRESSED_VOWELS : STRESSED_VOWELS;
      const kk = table[symbol];
      if (!kk) throw new Error(`Unrecognised ARPABET vowel: ${raw}`);
      segments.push({ kk, vowel: true, stress });
      continue;
    }

    const kk = CONSONANTS[symbol];
    if (!kk) throw new Error(`Unrecognised ARPABET consonant: ${raw}`);
    segments.push({ kk, vowel: false, stress: 0 });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Syllabification (needed only to place stress marks)
// ---------------------------------------------------------------------------

const TWO_CONSONANT_ONSETS = new Set([
  'pl', 'pr', 'pj', 'bl', 'br', 'bj', 'tr', 'tw', 'tj', 'dr', 'dw', 'dj',
  'kl', 'kr', 'kw', 'kj', 'gl', 'gr', 'gw', 'fl', 'fr', 'fj', 'θr', 'θw',
  'sl', 'sw', 'sp', 'st', 'sk', 'sm', 'sn', 'sf', 'sj', 'ʃr', 'vj', 'hj',
  'mj', 'nj', 'lj', 'bw',
]);

const THREE_CONSONANT_ONSETS = new Set([
  'spl', 'spr', 'spj', 'str', 'stj', 'skl', 'skr', 'skw', 'skj',
]);

/** Maximal onset principle, restricted to clusters English actually allows. */
function isLegalOnset(cluster: string[]): boolean {
  if (cluster.length <= 1) return true;
  const joined = cluster.join('');
  if (cluster.length === 2) return TWO_CONSONANT_ONSETS.has(joined);
  if (cluster.length === 3) return THREE_CONSONANT_ONSETS.has(joined);
  return false;
}

export interface Syllable {
  onset: string[];
  nucleus: string;
  coda: string[];
  stress: 0 | 1 | 2;
}

/**
 * Groups segments into syllables. Every syllable has exactly one vowel; the
 * consonants between two vowels go to the following onset as far as English
 * phonotactics allow, and the remainder become the preceding coda.
 */
export function syllabify(segments: ArpabetSegment[]): Syllable[] {
  const nucleiIndexes = segments
    .map((segment, index) => (segment.vowel ? index : -1))
    .filter((index) => index >= 0);

  if (nucleiIndexes.length === 0) return [];

  const syllables: Syllable[] = [];

  for (let i = 0; i < nucleiIndexes.length; i += 1) {
    const nucleusIndex = nucleiIndexes[i] as number;
    const previousNucleus = i === 0 ? -1 : (nucleiIndexes[i - 1] as number);
    const between = segments.slice(previousNucleus + 1, nucleusIndex).map((s) => s.kk);

    // How many of the intervening consonants can start this syllable?
    let onsetSize = 0;
    for (let size = Math.min(between.length, 3); size >= 1; size -= 1) {
      if (isLegalOnset(between.slice(between.length - size))) {
        onsetSize = size;
        break;
      }
    }
    // A word-initial cluster is entirely an onset even if it looks unusual.
    if (i === 0) onsetSize = between.length;

    const onset = between.slice(between.length - onsetSize);
    const carriedCoda = between.slice(0, between.length - onsetSize);

    if (carriedCoda.length > 0 && syllables.length > 0) {
      (syllables[syllables.length - 1] as Syllable).coda.push(...carriedCoda);
    }

    const nucleus = segments[nucleusIndex] as ArpabetSegment;
    syllables.push({ onset, nucleus: nucleus.kk, coda: [], stress: nucleus.stress });
  }

  // Everything after the final vowel is the last coda.
  const lastNucleus = nucleiIndexes[nucleiIndexes.length - 1] as number;
  const tail = segments.slice(lastNucleus + 1).map((s) => s.kk);
  if (tail.length > 0) {
    (syllables[syllables.length - 1] as Syllable).coda.push(...tail);
  }

  return syllables;
}

/**
 * Renders a full KK transcription, slashes included, from a CMUdict entry.
 * Stress marks are placed before the onset of the syllable that carries them,
 * which is the convention KK shares with IPA.
 */
export function kkFromArpabet(entry: string): string {
  const syllables = syllabify(parseArpabet(entry));
  const multisyllabic = syllables.length > 1;

  // CMUdict marks every element of a compound with stress 1 ("abbotstown" is
  // AE1 … AW1). A transcription may carry only one primary mark, so the first
  // wins and any later one is demoted to secondary.
  //
  // A few entries ("accredit" is AH0 K R EH2 D AH0 T) carry only secondary
  // stress. Every polysyllable needs a primary, so the first stressed syllable
  // is promoted in that case.
  const firstPrimary =
    syllables.findIndex((syllable) => syllable.stress === 1) >= 0
      ? syllables.findIndex((syllable) => syllable.stress === 1)
      : syllables.findIndex((syllable) => syllable.stress === 2);

  const body = syllables
    .map((syllable, index) => {
      if (!multisyllabic || syllable.stress === 0) {
        return `${syllable.onset.join('')}${syllable.nucleus}${syllable.coda.join('')}`;
      }
      const mark = index === firstPrimary ? PRIMARY_STRESS : SECONDARY_STRESS;
      return `${mark}${syllable.onset.join('')}${syllable.nucleus}${syllable.coda.join('')}`;
    })
    .join('');

  return `/${body}/`;
}

/** Hyphenated syllable breakdown, e.g. "con·sol·i·date". */
export function syllableCountFromArpabet(entry: string): number {
  return syllabify(parseArpabet(entry)).length;
}

// ---------------------------------------------------------------------------
// KK parsing
// ---------------------------------------------------------------------------

export interface ParsedKk {
  /** Phoneme sequence with stress marks removed. */
  phonemes: string[];
  /** Ordinal (among vowels) of the vowel carrying primary stress, or -1. */
  primaryStressVowelOrdinal: number;
  /** A well-formed transcription has at most one primary stress mark. */
  primaryStressCount: number;
  secondaryStressCount: number;
  vowelCount: number;
}

export class KkParseError extends Error {}

/** Tokenises a `/…/` transcription into KK phonemes plus stress information. */
export function parseKk(transcription: string): ParsedKk {
  const inner = transcription.trim().replace(/^\//, '').replace(/\/$/, '');

  const phonemes: string[] = [];
  let primaryStressVowelOrdinal = -1;
  let primaryStressCount = 0;
  let secondaryStressCount = 0;
  let vowelCount = 0;

  let index = 0;
  outer: while (index < inner.length) {
    const char = inner[index] as string;

    if (char === PRIMARY_STRESS) {
      // The first mark is the primary stress; a second one is a data error and
      // is reported by `compareKk` rather than silently overwriting the first.
      if (primaryStressCount === 0) primaryStressVowelOrdinal = vowelCount;
      primaryStressCount += 1;
      index += 1;
      continue;
    }
    if (char === SECONDARY_STRESS) {
      secondaryStressCount += 1;
      index += 1;
      continue;
    }
    if (char === '.' || char === ' ' || char === '-' || char === '̩') {
      index += 1;
      continue;
    }

    for (const token of KK_TOKENS) {
      if (inner.startsWith(token, index)) {
        phonemes.push(token);
        if (isKkVowel(token)) vowelCount += 1;
        index += token.length;
        continue outer;
      }
    }

    throw new KkParseError(
      `Unrecognised KK symbol "${char}" (U+${char.codePointAt(0)?.toString(16).toUpperCase()}) in ${transcription}`,
    );
  }

  return {
    phonemes,
    primaryStressVowelOrdinal,
    primaryStressCount,
    secondaryStressCount,
    vowelCount,
  };
}

/** Pulls every `/…/` transcription out of a pronunciation field. */
export function extractTranscriptions(field: string): string[] {
  return [...field.matchAll(/\/[^/]+\//g)].map((match) => match[0]);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/**
 * Vowels that neutralise in unstressed syllables in American English (the
 * "weak vowel merger"). Dictionaries disagree freely here, so a difference
 * confined to this set is reported as a variant rather than an error.
 */
const REDUCED_VOWELS = new Set(['ə', 'ɪ', 'i', 'ʊ']);

/**
 * Canonical form used for comparison:
 *  - `ɚ` is expanded to `ə` + `r` so that "kəˈrɑbəret" and "kɚˈɑbɚret"
 *    (the same sounds, syllabified differently) compare equal;
 *  - `n` before `k`/`g` becomes `ŋ`, since CMUdict writes the unassimilated
 *    form while dictionaries write the assimilated one.
 */
function canonicalize(phonemes: string[]): string[] {
  const expanded: string[] = [];
  for (const phoneme of phonemes) {
    if (phoneme === 'ɚ') expanded.push('ə', 'r');
    else expanded.push(phoneme);
  }

  return expanded.map((phoneme, index) => {
    const next = expanded[index + 1];
    if (phoneme === 'n' && (next === 'k' || next === 'g')) return 'ŋ';
    return phoneme;
  });
}

export type ComparisonStatus = 'match' | 'convention' | 'variant' | 'mismatch';

/**
 * House conventions: systematic, deliberate departures from CMUdict notation
 * that apply corpus-wide rather than word by word.
 *
 * `final-i`: KK as taught in Taiwan writes the unstressed "happy" vowel as
 * /ɪ/ (ˈhæpɪ), where CMUdict uses IY0 (/i/). This affects every word ending in
 * -y, -ry, -cy, -bly and the /ɪə/ of -ious/-ion, so it is reported separately
 * from genuine dictionary disagreement.
 */
export const KK_CONVENTIONS = {
  finalI: 'unstressed /i/ is written /ɪ/, following KK as taught in Taiwan',
} as const;

export interface ComparisonResult {
  status: ComparisonStatus;
  /** Human-readable reasons; empty when the status is `match`. */
  notes: string[];
  /** KK rendering of the dictionary entry, for the report. */
  expected: string;
}

/**
 * Checks one KK transcription against a CMUdict entry.
 *
 * `mismatch` means the segments genuinely disagree or the stress is on the
 * wrong syllable. `variant` means the only differences are unstressed-vowel
 * choices that reputable dictionaries also disagree about.
 */
export function compareKk(transcription: string, arpabetEntry: string): ComparisonResult {
  const expected = kkFromArpabet(arpabetEntry);
  const notes: string[] = [];

  const mine = parseKk(transcription);
  const reference = parseArpabet(arpabetEntry);

  if (mine.primaryStressCount > 1) {
    return {
      status: 'mismatch',
      expected,
      notes: [`${mine.primaryStressCount} primary stress marks; a transcription may have only one`],
    };
  }

  const mineSegments = canonicalize(mine.phonemes);
  const referenceSegments = canonicalize(reference.map((segment) => segment.kk));

  if (mineSegments.length !== referenceSegments.length) {
    return {
      status: 'mismatch',
      expected,
      notes: [
        `segment count differs: transcription has ${mineSegments.length}, dictionary has ${referenceSegments.length}`,
        `  yours: ${mineSegments.join(' ')}`,
        `  cmudict: ${referenceSegments.join(' ')}`,
      ],
    };
  }

  // The stress flags line up with `reference`, not with the expanded form, so
  // rebuild a parallel stress array during canonicalisation.
  const referenceStress: (0 | 1 | 2)[] = [];
  for (const segment of reference) {
    referenceStress.push(segment.stress);
    if (segment.kk === 'ɚ') referenceStress.push(0); // the inserted `r`
  }

  let variant = false;
  let convention = false;

  for (let i = 0; i < mineSegments.length; i += 1) {
    const a = mineSegments[i] as string;
    const b = referenceSegments[i] as string;
    if (a === b) continue;

    // The house convention: unstressed /i/ written as /ɪ/.
    if (a === 'ɪ' && b === 'i' && referenceStress[i] === 0) {
      convention = true;
      notes.push(`vowel ${i + 1}: /ɪ/ for /i/ — ${KK_CONVENTIONS.finalI}`);
      continue;
    }

    const bothReduced = REDUCED_VOWELS.has(a) && REDUCED_VOWELS.has(b);
    if (bothReduced && referenceStress[i] === 0) {
      variant = true;
      notes.push(`unstressed vowel ${i + 1}: yours /${a}/, cmudict /${b}/ (weak-vowel variant)`);
      continue;
    }

    return {
      status: 'mismatch',
      expected,
      notes: [
        `segment ${i + 1} differs: yours /${a}/, cmudict /${b}/`,
        `  yours: ${mineSegments.join(' ')}`,
        `  cmudict: ${referenceSegments.join(' ')}`,
      ],
    };
  }

  // Stress placement, expressed as "how many vowels precede the stressed one".
  // Where CMUdict records only secondary stress, the first stressed vowel is
  // treated as the primary one, matching what `kkFromArpabet` renders.
  const referenceVowels = reference.filter((segment) => segment.vowel);
  const referencePrimary =
    referenceVowels.findIndex((segment) => segment.stress === 1) >= 0
      ? referenceVowels.findIndex((segment) => segment.stress === 1)
      : referenceVowels.findIndex((segment) => segment.stress === 2);

  if (referenceVowels.length > 1) {
    if (mine.primaryStressVowelOrdinal < 0) {
      return {
        status: 'mismatch',
        expected,
        notes: ['no primary stress mark on a word of more than one syllable'],
      };
    }
    if (referencePrimary >= 0 && mine.primaryStressVowelOrdinal !== referencePrimary) {
      return {
        status: 'mismatch',
        expected,
        notes: [
          `primary stress on syllable ${mine.primaryStressVowelOrdinal + 1}, dictionary says syllable ${referencePrimary + 1}`,
        ],
      };
    }
  }

  const promotedSecondary =
    referenceVowels.some((segment) => segment.stress === 1) ? 0 : 1;
  const referenceSecondary =
    referenceVowels.filter((segment) => segment.stress === 2).length - promotedSecondary;
  if (mine.secondaryStressCount !== referenceSecondary) {
    variant = true;
    notes.push(
      `secondary stress marks: yours ${mine.secondaryStressCount}, cmudict ${referenceSecondary}`,
    );
  }

  if (variant) return { status: 'variant', expected, notes };
  if (convention) return { status: 'convention', expected, notes };
  return { status: 'match', expected, notes };
}
