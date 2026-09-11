# Vocabulary enrichment review

The vocabulary was divided into 15 disjoint assignments. Each assignment reviews
the existing meanings before adding synonyms, natural antonyms, and common usage
phrases with Traditional Chinese explanations. Empty relation arrays mean that no
suitable everyday equivalent or natural opposite was identified; they are not
filled with broader categories or invented opposites.

Common usages are stored on the matching sense in `collocations`. Bilingual lesson
TSV files also retain these phrases, so `npm run edit:bilingual` can reproduce them.
Existing definitions and examples are preserved. Schema checks establish data
consistency; they do not constitute independent dictionary verification.

## Coverage and validation

| Measure | Final coverage |
| --- | --- |
| Words reviewed | 4,120 / 4,120 |
| Words with at least one usage phrase | 4,120 / 4,120 |
| Usage phrases | 6,266 |
| Senses with usage phrases | 4,888 / 4,906 |
| Words with suitable synonyms | 3,701 |
| Synonym records | 4,359 |
| Words with natural antonyms | 1,573 |
| Antonym records | 1,668 |

Every related term has a Traditional Chinese note, and every usage phrase has a
Traditional Chinese meaning. The 18 sense-level exceptions are listed below.
All original definitions and examples were retained; a common adjective sense
was added for `supple`, and six inaccurate existing antonym records were removed.

Validation passed: `npm run validate:data`, `npm run verify:kk`, all 502 tests,
and `npm run build`. The application lint check passes with `.codex/**` excluded;
the unfiltered lint command reports 24 pre-existing errors in installed skill
scripts under `.codex/skills/.system/openai-docs/scripts/`.

The normal Vite chunk-size warning remains. The rebuilt search data is 1,209.30 kB
minified / 499.93 kB gzip and continues to load on demand.

## Existing senses needing editorial attention

The following original senses were flagged during enrichment. They have no added
common phrase where a natural phrase matching the existing sense could not be
identified. Other senses of the same headwords still have usages.

| Sense | Reason |
| --- | --- |
| `s_flaunt_noun` | Rare noun; the definition cites “if you've got it, flaunt it,” which actually uses the verb. |
| `s_flit_noun` | Rare noun for a quick movement; no established common phrase selected. |
| `s_flunk_noun` | Uncommon noun for an exam failure; common usages belong to the verb. |
| `s_tube_verb` | Existing travel/transport-through-a-tube sense has no suitable common standalone verb phrase. |
| `s_whiff_verb` | Rare “emit a faint smell” sense; common noun phrases do not match it. |
| `s_asteroid_adjective` | Rare “star-shaped” adjective sense. |
| `s_overall_noun` | Its definition and example describe the adverb; “on the overall” is questionable. |
| `s_beneficiary_adjective` | Obscure ecclesiastical adjective sense. |
| `s_immune_noun` | Existing definition describes an immunity-providing substance; noun sense needs verification. |
| `s_imperial_noun` | Existing definition describes a generic imperial measurement unit; noun sense needs verification. |
| `s_incorporate_adjective` | Archaic legal adjective for an incorporated body; no common phrase selected. |
| `s_callous_verb` | Rare verb; no reliable common phrase selected. |
| `s_canal_verb` | Rare verb; the existing example “canaled the river” is questionable. |
| `s_eclectic_noun` | No established common noun phrase selected. |
| `s_initiative_adjective` | Existing “initiative spirit” usage is unnatural. |
| `s_endemic_noun` | Rare noun sense; common usage is covered by the adjective. |
| `s_supple_verb` | Rare verb sense; common usage is covered by the newly added adjective. |
| `s_leather_verb` | Rare “cover or line with leather” sense; no common phrase selected. |

Other editorial notes:

- `counterpart`: removed the existing antonym `opposite`, which is not a natural
  antonym of a person or thing with an equivalent role or function.
- Removed other existing conceptual contrasts that were not natural antonyms:
  `notion → fact`, `juxtapose → conflate`, `reconcile → conflate`,
  `precedent → unprecedented` (also a different part of speech), and
  `supersede → precede`.
- `supple`: added the missing common adjective sense, `s_supple_adjective`, with
  bilingual explanation and phrases such as “supple leather,” while retaining
  the existing rare verb sense.
- `pantomime`: the English sense describes British Christmas musical comedy, while
  默劇／啞劇 can misleadingly suggest silent performance.
- `regiment`: the original translation 軍團 should be reviewed; 團 is the more
  precise military unit, while 軍團 usually corresponds to an army corps.
- Rare original senses such as adjective `opponent`, noun `arctic` (overshoes),
  noun `array` (fine attire), noun `glisten`, and verb `scant` retain phrases that
  follow those senses. They should not be presented as the most common meanings
  of their headwords.
