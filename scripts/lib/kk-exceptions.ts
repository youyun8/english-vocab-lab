/**
 * Headwords where the corpus deliberately departs from the CMU Pronouncing
 * Dictionary.
 *
 * CMUdict stores a single pronunciation per word, and that pronunciation is
 * sometimes a less common variant than the one every major learner dictionary
 * prints. Where the two disagree and the learner-facing dictionaries are
 * unanimous, the corpus follows the dictionaries — but the departure has to be
 * declared here, with the exact transcription it licenses and a reason.
 *
 * Because the accepted transcription is pinned, an exception cannot silently
 * cover a later, different change to the same word.
 */
export interface KkException {
  lemma: string;
  /** The exact transcription this exception licenses. */
  accepted: string;
  reason: string;
}

export const KK_EXCEPTIONS: KkException[] = [
  {
    lemma: 'undermine',
    accepted: '/ˌʌndɚˈmaɪn/',
    reason:
      'CMUdict records initial stress (/ˈʌndɚˌmaɪn/), but Merriam-Webster, Cambridge and ' +
      'Longman all give primary stress on the final syllable for the verb, which is the only ' +
      'part of speech this entry teaches.',
  },
  {
    lemma: 'tenuous',
    accepted: '/ˈtɛnjuəs/',
    reason:
      'CMUdict writes the glide explicitly (/ˈtɛnjəwəs/, as Merriam-Webster does). The ' +
      'American Heritage and Cambridge form /ˈtɛnjuəs/ denotes the same sequence and is much ' +
      'easier for a learner to read.',
  },
];

const byLemma = new Map(
  KK_EXCEPTIONS.map((exception) => [exception.lemma.toLowerCase(), exception] as const),
);

/** Returns the exception covering this exact transcription, if there is one. */
export function findKkException(lemma: string, transcription: string): KkException | null {
  const exception = byLemma.get(lemma.toLowerCase());
  if (!exception) return null;
  return exception.accepted === transcription.trim() ? exception : null;
}
