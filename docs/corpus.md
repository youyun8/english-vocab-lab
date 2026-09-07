# TOEFL / GRE / IELTS corpus

The corpus contains **4,120 distinct headwords**: the original 120 curated lessons and
4,000 dictionary entries for recognition practice. There are 251 curated questions;
the three recognition question types are also generated from the vocabulary at runtime,
so the browsable question bank covers every headword that ships.

## Content depth

The original lessons retain their IDs, senses, bilingual examples, usage explanations,
collocations and comparisons. Imported entries have English definitions, Traditional
Chinese glosses, parts of speech, KK pronunciation and exam tags. They do **not** claim
hand-written examples, usage guidance, synonyms or verified CEFR ratings.

The word detail page identifies dictionary entries and hides absent lesson sections.
They participate in search, bookmarks, progress, review and generated recognition quizzes.

The app does not download the corpus to browse it. `npm run build:index` generates
`src/data/vocabulary-index.json` (one row per word: headword, KK, parts of speech, CEFR, gloss,
tags, and the chunk holding the full entry) and `src/data/vocabulary-search.json` (the deeper
searchable prose). Browsing, filtering, sorting, statistics and links read the index; a word's full
entry is fetched from its chunk when the word is opened; the search file is fetched on the first
query. `npm run validate:data` fails if either generated file is out of date.
The tag filter supports `toefl`, `gre`, `ielts` and `dictionary`. The word bank displays
50 results per page, with filtering and sorting applied to the entire corpus first, and each
filter value carries the number of words it would leave.

## Sources and selection

- Definitions, Chinese glosses, exam labels and frequency ranks: [ECDICT](https://github.com/skywind3000/ECDICT/tree/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b),
  revision `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`, `ecdict.csv`.
  ECDICT distributes this snapshot under the [MIT license](../public/licenses/ECDICT-MIT.txt).
  SHA-256: `1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`.
- American pronunciations: the locked `cmu-pronouncing-dictionary` package, converted
  through the project's existing ARPABET-to-KK converter. See the
  [CMUdict notice](../public/licenses/CMUdict-BSD.txt) and
  [package notice](../public/licenses/CMU-package-ISC.txt).
- Script conversion: the locked `opencc-js` development dependency (`cn` → `twp`).
  Conversion runs at import time; no conversion library or source CSV ships in the app.

Selection uses ECDICT's `toefl`, `gre` and `ielts` labels. These are third-party study
labels, **not an ETS- or IELTS-endorsed or guaranteed exam list**. Existing lesson tags are
preserved.

The importer selects in two passes. **Pass 1** is the original 2,000-word TOEFL/GRE
selection, unchanged in inputs, ordering and quotas: 1,000 entries tagged for both exams,
500 additional TOEFL entries and 500 additional GRE entries. Keeping it fixed is what lets
every word it picked keep its id, so curated questions and saved learner progress still
point at real words after a re-import.

**Pass 2** adds 2,000 more from what pass 1 left behind: 1,200 TOEFL/GRE words ranked
inside the top 12,000 by frequency, 500 advanced GRE words (rank 12,000 or worse, with an
academic shape), and 300 IELTS words ranked 3,500 or worse — below that threshold the
IELTS list is largely B1 revision, which this corpus is not for. Tag coverage across the
4,000 imported words: 2,791 `toefl`, 2,593 `gre`, 2,186 `ielts`.

The selection balances frequency ranges and gives priority to the independently chosen
headwords in `scripts/data/exam-priorities.txt`. Advanced GRE selection favors verbs,
adjectives and abstract nouns; TOEFL selection also includes science, society and campus
vocabulary. Priorities are preferences, not a completeness checklist: entries with missing
pronunciation or unusable bilingual definitions are omitted. Basic-school words marked
`zk`, inflection references, duplicate headwords, unlabelled definitions and a conservative
list of heteronyms requiring pronunciation review are excluded. Proper-name biographical
senses and malformed lines are filtered. Eligible words must have matching English and
Chinese parts of speech. The source's ordering within each POS is preserved.

The 12 original editorial definition corrections in
`scripts/data/exam-definition-overrides.json` focus selected entries on useful learner
senses (for example, *aberration* as a departure from what is normal).

## Limitations

The new entries are dictionary imports, not 4,000 fully edited lessons. English and Chinese
senses are grouped by part of speech; they are not asserted to align one-to-one. Some source
glosses may be dated or broader than their English definitions. Traditional Chinese has been
automatically converted and has not received exhaustive human language review. No placeholder
sentences or fabricated usage notes are added to satisfy the lesson schema.

ECDICT provides no CEFR rating. Imported entries use the smaller positive BNC/FRQ rank as a
rough **sorting estimate**: up to 5,000 → B2, up to 12,000 → C1, otherwise C2. Missing ranks
sort as 100,000. Frequency is not a CEFR assessment. The word detail page says so for every
imported entry; filters and statistics include these estimated bands.
Current totals including original lessons: 1,907 B2, 1,429 C1, 784 C2.

Generated quizzes exclude declared synonyms in either direction, shared Chinese gloss
components across all senses, and identical English definitions. This reduces ambiguity;
it cannot establish semantic equivalence for every pair of dictionary meanings. Nuanced
usage, grammar and cloze questions remain in the curated bank.

## Reproduce the import

From the repository root, after `npm ci`:

```bash
curl --fail --location \
  https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv \
  --output /tmp/ecdict.csv
npm run import:exam -- /tmp/ecdict.csv
npm run verify
```

The importer checks the source checksum before parsing or writing, validates all selected
entries, clears the previous chunks, and deterministically writes 80 chunks of 50 words to
`src/data/vocabulary/exam`.
It never writes the original `b2`, `c1` or `c2` directories or the curated question bank.
The source CSV is about 66 MB and is intentionally not committed. Generated JSON is checked
in, so normal builds, tests and app usage require neither the source download nor network
access to ECDICT. The source notices in `public/licenses` are included in built assets.

For targeted definition fixes, edit the overrides and rerun the importer. For full lessons,
move the entry into the appropriate curated directory, retain its word ID/slug, add reviewed
examples and usage guidance, remove `dictionarySource`, then regenerate the import and review
the resulting selection diff. Curated entries still require translated examples and usage
explanations in the entry schema; dictionary attribution is required to omit those fields.
