import { describe, expect, it } from 'vitest';

import { loadVocabulary } from '@/data';
import { quizQuestionSchema, OPTIONS_PER_QUESTION, type QuestionType } from '@/domain/quiz';
import { shortMeaningZh, type VocabularyEntry } from '@/domain/vocabulary';
import { createRng } from '@/utils/random';
import { GENERATED_TYPES, generateQuestions } from './question-generator';

const entries = await loadVocabulary();
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const rng = () => createRng(42);

describe('generateQuestions', () => {
  it('produces at most one question per entry', () => {
    // Three near-identical ways of asking "what does this word mean" is padding,
    // not practice; each word gets the single hardest question it can support.
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const counts = new Map<string, number>();
    for (const question of generated) {
      const wordId = question.wordIds[0]!;
      counts.set(wordId, (counts.get(wordId) ?? 0) + 1);
    }
    for (const [wordId, count] of counts) expect(count, wordId).toBe(1);
    expect(generated.length).toBeLessThanOrEqual(entries.length);
  });

  it('yields nothing for a word whose question is not of a requested type', () => {
    // The type a word produces is fixed, so filtering can only drop words. If
    // filtering could fall back to an easier framing, a question counted from
    // the vocabulary index would materialise under a different id.
    const sample = entries.slice(0, 40);
    const types: QuestionType[] = ['meaning_zh_to_en'];
    const generated = generateQuestions(sample, { rng: rng(), types, pool: entries });
    const unfiltered = generateQuestions(sample, { rng: rng(), pool: entries });
    for (const question of generated) expect(question.type).toBe('meaning_zh_to_en');
    const expected = unfiltered.filter((question) => question.type === 'meaning_zh_to_en');
    expect(generated.map((question) => question.id)).toEqual(expected.map((q) => q.id));
  });

  it('blanks the bare headword, never an inflected form of it', () => {
    // The options are bare lemmas, so a gap holding "retained" makes the marked
    // answer "retain" ungrammatical — the learner with the better ear is the
    // one who gets it wrong.
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const offenders: string[] = [];
    for (const question of generated) {
      if (!question.context?.includes('___')) continue;
      const entry = byId.get(question.wordIds[0]!)!;
      const lemma = entry.lemma.toLowerCase();
      const stem = question.context.split(/\s+/);
      const gap = stem.findIndex((token) => token.includes('___'));
      // Identify the example the stem was cut from by matching every token but
      // the gap: two senses of one word can have same-length examples, so the
      // lengths alone would attribute the blank to the wrong sentence.
      for (const example of entry.senses.flatMap((sense) => sense.examples)) {
        const words = example.en.trim().split(/\s+/);
        if (words.length !== stem.length) continue;
        if (!stem.every((token, at) => at === gap || token === words[at])) continue;
        // Substituting the answer into the gap has to give back the authored
        // sentence. Comparing the whole token keeps "the ___'s leader" and
        // "a ___-faced clerk" legal while still rejecting "are ___ for a year".
        const filled = stem[gap]!.replace('___', lemma).toLowerCase();
        if (filled !== words[gap]!.toLowerCase()) {
          offenders.push(`${question.id}: gap "${words[gap]}" but answer "${lemma}"`);
        }
        break;
      }
    }
    expect(offenders).toEqual([]);
  });

  it('draws look-alike distractors from the answer\'s own part of speech', () => {
    // Prefix and suffix buckets are keyed on spelling alone. Left unfiltered
    // they offer "retail" and "retailer" against "are ___ for ninety days",
    // which a learner solves by grammar without knowing either word.
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const byLemma = new Map(entries.map((entry) => [entry.lemma.toLowerCase(), entry]));
    let checked = 0;
    let mismatched = 0;
    for (const question of generated) {
      const target = byId.get(question.wordIds[0]!)!;
      const pos = target.senses[0]!.partOfSpeech;
      for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        const distractor = byLemma.get(option.text.trim().toLowerCase());
        if (!distractor) continue;
        checked += 1;
        if (distractor.senses[0]!.partOfSpeech !== pos) mismatched += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    // Not zero: for a part of speech with too few words to fill the options —
    // adverbs, chiefly — matching it exactly is impossible and the filter lifts.
    expect(mismatched / checked).toBeLessThan(0.05);
  });

  it('gives recognition practice to the overwhelming majority of imported words', () => {
    const imported = entries.filter((entry) => entry.dictionarySource);
    const generated = generateQuestions(imported, { rng: rng(), pool: entries });
    const covered = new Set(generated.map((question) => question.wordIds[0]!));
    // The shortfall is the entries whose gloss is a bare function word; those
    // cannot produce an item where exactly one option is defensible.
    expect(covered.size / imported.length).toBeGreaterThan(0.95);
  });

  it('spreads words across the formats, sentence completion dominating', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const share = (type: QuestionType) =>
      generated.filter((question) => question.type === type).length / generated.length;

    // English sentence completion has no Chinese to fall back on, so it is the
    // hardest framing and takes the bulk of the corpus. The other two still get
    // a real slice: one type for four thousand words would make the question
    // type filter meaningless and every session identical.
    expect(share('definition_to_word')).toBeGreaterThan(0.6);
    expect(share('meaning_en_to_zh')).toBeGreaterThan(0.1);
    expect(share('meaning_zh_to_en')).toBeGreaterThan(0.05);
  });

  it('sets every generated question at exam difficulty', () => {
    // The old scale started at 1, which called a C-level word easy because the
    // format was simple. Ranked distractors mean no item is a giveaway now.
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      expect(question.difficulty, question.id).toBeGreaterThanOrEqual(2);
    }
    const mean = generated.reduce((sum, q) => sum + q.difficulty, 0) / generated.length;
    expect(mean).toBeGreaterThan(3);
  });

  it('builds its stem from a real sentence whenever the entry has one', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const withContext = generated.filter((question) => (question.context ?? '').trim());
    expect(withContext.length / generated.length).toBeGreaterThan(0.9);
  });

  it('draws distractors that resemble the answer rather than random words', () => {
    // A distractor picked at random from the same part of speech is usually
    // eliminable on sight. These must at least share the answer's level or a
    // topic tag — the property that makes an option worth considering.
    const generated = generateQuestions(entries.slice(0, 300), { rng: rng(), pool: entries });
    const byLemma = new Map(entries.map((entry) => [entry.lemma, entry]));
    let related = 0;
    let total = 0;
    for (const question of generated) {
      if (question.type !== 'definition_to_word') continue;
      const target = byId.get(question.wordIds[0]!)!;
      for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        const other = byLemma.get(option.text);
        if (!other) continue;
        total += 1;
        const sharesTag = other.tags.some((tag) => target.tags.includes(tag));
        if (other.cefr === target.cefr || sharesTag) related += 1;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(related / total).toBeGreaterThan(0.85);
  });

  it('trims listed dictionary glosses down to a readable option', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      if (question.type !== 'meaning_en_to_zh') continue;
      for (const option of question.options) {
        expect(option.text.split(/[；;]/).length, question.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it('never shows the headword inside a definition prompt', () => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });

    for (const question of generated) {
      if (question.type !== 'definition_to_word') continue;
      const lemma = byId.get(question.wordIds[0]!)!.lemma.toLowerCase();
      const context = (question.context ?? '').toLowerCase();
      // The headword must not appear as a word — derived forms included.
      const tokens = context.match(/[a-z]+/g) ?? [];
      expect(tokens.some((token) => token.startsWith(lemma)), question.id).toBe(false);
      // What survives masking still has to identify a word on its own.
      const words = context.split(/\s+/).filter((word) => word && word !== '___');
      expect(words.length, question.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('skips the definition question when masking leaves nothing to go on', () => {
    const base = entries.find((entry) => entry.lemma === 'eliminate') ?? entries[0]!;
    const stub = (lemma: string, definitionEn: string, gloss: string) => ({
      ...base, id: `w_${lemma}`, lemma, slug: lemma, synonyms: [],
      senses: [{ ...base.senses[0]!, definitionEn, definitionZh: gloss }],
    });
    const target = stub('brisk', 'become brisk', '輕快的');
    const pool = [
      target,
      stub('alpha', 'a definition with plenty of words in it', '甲'),
      stub('beta', 'another definition with plenty of words', '乙'),
      stub('gamma', 'a third definition with plenty of words', '丙'),
    ];
    const generated = generateQuestions([target], { rng: rng(), pool });
    expect(generated.map((question) => question.type)).toEqual(['meaning_en_to_zh']);
  });

  it('skips a word whose gloss is too thin to have a defensible answer', () => {
    const base = entries.find((entry) => entry.lemma === 'eliminate') ?? entries[0]!;
    const stub = (lemma: string, gloss: string) => ({
      ...base, id: `w_${lemma}`, lemma, slug: lemma, synonyms: [],
      senses: [{ ...base.senses[0]!, definitionEn: `a definition for ${lemma}`, definitionZh: gloss }],
    });
    const target = stub('particle', '的');
    const pool = [target, stub('alpha', '甲類'), stub('beta', '乙類'), stub('gamma', '丙類')];
    expect(generateQuestions([target], { rng: rng(), pool })).toEqual([]);
  });

  it('excludes partial gloss overlap, secondary senses, and reverse synonym links', () => {
    const base = entries[0]!;
    const word = (lemma: string, gloss: string): VocabularyEntry => ({
      ...base, id: `w_${lemma}`, lemma, slug: lemma, synonyms: [],
      senses: [{ ...base.senses[0]!, definitionEn: `Definition for ${lemma}`, definitionZh: gloss }],
    });
    const target = word('target', '減少；緩和');
    const overlap = word('overlap', '減少；縮小');
    const secondary = word('secondary', '消失');
    secondary.senses.push({ ...secondary.senses[0]!, definitionZh: '緩和' });
    const reverse = { ...word('reverse', '削弱'), synonyms: [{ lemma: 'target' }] };
    const distinct = [word('first', '增加'), word('second', '支持'), word('third', '預測')];
    const generated = generateQuestions([target], { rng: rng(), pool: [target, overlap, secondary, reverse, ...distinct] });
    expect(generated).toHaveLength(1);
    for (const question of generated) {
      const texts = question.options.map((option) => option.text);
      for (const excluded of [overlap, secondary, reverse]) {
        expect(texts).not.toContain(excluded.lemma);
        expect(texts).not.toContain(shortMeaningZh(excluded));
      }
    }
  });

  it('only generates the simple recognition types' , () => {
    const generated = generateQuestions(entries.slice(0, 5), { rng: rng(), pool: entries });
    for (const question of generated) {
      expect(GENERATED_TYPES).toContain(question.type);
    }
  });

  it('refuses to generate the nuanced types even when asked', () => {
    const generated = generateQuestions(entries.slice(0, 5), {
      rng: rng(),
      pool: entries,
      types: ['usage', 'collocation', 'grammar', 'confusing_words'],
    });
    expect(generated).toEqual([]);
  });

  it('emits questions that satisfy the quiz schema', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const result = quizQuestionSchema.safeParse(question);
      expect(result.success, `${question.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('never produces duplicate question ids', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    const ids = generated.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never produces duplicate option text within a question', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const texts = question.options.map((option) => option.text.trim().toLowerCase());
      expect(new Set(texts).size, question.id).toBe(OPTIONS_PER_QUESTION);
    }
  });

  it('always includes the correct answer among the options', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const ids = question.options.map((option) => option.id);
      expect(ids, question.id).toContain(question.correctOptionId);
    }
  });

  it('never uses a declared synonym as a distractor (ambiguity protection)', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });

    for (const question of generated) {
      const target = byId.get(question.wordIds[0]!)!;
      const synonymLemmas = new Set(
        (target.synonyms ?? []).map((related) => related.lemma.toLowerCase()),
      );
      const synonymGlosses = new Set(
        entries
          .filter((entry) => synonymLemmas.has(entry.lemma.toLowerCase()))
          .map((entry) => shortMeaningZh(entry)),
      );

      for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        expect(synonymLemmas.has(option.text.toLowerCase()), question.id).toBe(false);
        expect(synonymGlosses.has(option.text), question.id).toBe(false);
      }
    }
  });

  it('never puts one gloss next to a gloss that spells it out', () => {
    // 家畜 beside 走失的家畜, or 感激 beside 感激之情, is two defensible
    // answers. Exact-match exclusion misses these; containment catches them.
    const byLemma = new Map(entries.map((entry) => [entry.lemma, entry]));
    const segments = (gloss: string) =>
      gloss
        .replace(/[（(][^）)]*[）)]/g, '')
        .split(/[；;，,、]/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length >= 2);

    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const target = byId.get(question.wordIds[0]!)!;
      const answerSegments = target.senses.flatMap((sense) => segments(sense.definitionZh));

      for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        // Options are either a gloss or a headword; resolve both to an entry.
        const other = byLemma.get(option.text)
          ?? entries.find((entry) => shortMeaningZh(entry) === option.text);
        if (!other) continue;
        for (const segment of other.senses.flatMap((sense) => segments(sense.definitionZh))) {
          for (const answerSegment of answerSegments) {
            const overlaps = segment !== answerSegment
              && (segment.includes(answerSegment) || answerSegment.includes(segment));
            expect(overlaps, `${question.id}: ${answerSegment} vs ${segment}`).toBe(false);
          }
        }
      }
    }
  });

  it('never uses a distractor whose gloss equals the correct answer', () => {
    const generated = generateQuestions(entries, { rng: rng(), pool: entries });
    for (const question of generated) {
      const correct = question.options.find((o) => o.id === question.correctOptionId)!;
      const others = question.options.filter((o) => o.id !== question.correctOptionId);
      for (const other of others) {
        expect(other.text, question.id).not.toBe(correct.text);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const first = generateQuestions(entries.slice(0, 8), { rng: createRng(7), pool: entries });
    const second = generateQuestions(entries.slice(0, 8), { rng: createRng(7), pool: entries });
    expect(first).toEqual(second);
  });

  it('returns nothing when the pool is too small to build distractors', () => {
    const tiny = entries.slice(0, 2);
    const generated = generateQuestions(tiny, { rng: rng(), pool: tiny });
    expect(generated).toEqual([]);
  });

  it('marks generated questions with source "generated"', () => {
    const generated = generateQuestions(entries.slice(0, 3), { rng: rng(), pool: entries });
    for (const question of generated) {
      expect(question.source).toBe('generated');
    }
  });
});
