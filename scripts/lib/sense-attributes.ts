import { readFileSync, readdirSync } from 'node:fs';

import { registerSchema, type Register } from '../../src/domain/vocabulary';

/**
 * Sense-level attributes authored alongside the bilingual lessons.
 *
 * `register` and `grammarPatterns` are part of the unified word-page spec, but
 * they were added long after the bilingual lesson rows were written. Rather
 * than rewrite 4,775 existing rows — and risk corrupting the definitions and
 * examples already in them — they live in their own sidecar files keyed by
 * `lemma` + `sense`, and are merged in when lessons are loaded.
 *
 * Files are split by alphabetical slice under `scripts/data/sense-attributes/`
 * for the same reason the lessons are: one contributor owns one file and never
 * touches another's lines.
 */

export const SENSE_ATTRIBUTE_HEADER = 'lemma\tsense\tregister\tgrammarPatterns';

/** The mutually exclusive half of the register taxonomy. */
const FORMALITY = new Set<string>(['formal', 'informal', 'neutral']);

export interface SenseAttributes {
  register: [Register, ...Register[]];
  grammarPatterns: string[];
}

/** Key identifying one authored sense row across every lesson file. */
export function senseAttributeKey(lemma: string, sense: string): string {
  return `${lemma}\t${sense}`;
}

/** Parses one data row. Throws with the caller's context on any problem. */
export function parseSenseAttributeRow(columns: string[]): SenseAttributes {
  if (columns.length !== 4) {
    throw new Error(`expected 4 tab-separated columns, found ${columns.length}`);
  }
  const [lemma, sense, registerText, patternsText] = columns as [string, string, string, string];
  if (!lemma.trim() || !sense.trim()) throw new Error('lemma and sense must both be filled in');

  const register = registerText.split(',').map((value) => value.trim()).filter(Boolean);
  if (register.length === 0) throw new Error('register must list at least one value');
  for (const value of register) {
    if (!registerSchema.safeParse(value).success) {
      throw new Error(`unknown register "${value}"`);
    }
  }
  // The taxonomy mixes two axes: formality is a scale and a sense sits at one
  // point on it, while the rest (academic, spoken, …) name domains and can
  // stack. Two formality values render as contradictory adjacent badges.
  const formality = register.filter((value) => FORMALITY.has(value));
  if (formality.length > 1) {
    throw new Error(`register may carry only one formality value, found "${formality.join(', ')}"`);
  }
  if (new Set(register).size !== register.length) {
    throw new Error(`register lists a duplicate value: "${register.join(', ')}"`);
  }

  let patterns: unknown;
  try {
    patterns = JSON.parse(patternsText);
  } catch {
    throw new Error('grammarPatterns must be a JSON array of strings');
  }
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error('grammarPatterns must be a non-empty JSON array');
  }
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern.trim()) {
      throw new Error('every grammar pattern must be a non-empty string');
    }
    // `+` joins a slot to what precedes it, so a pattern cannot open with one:
    // patterns are rendered verbatim, and "+ noun + accumulates on + noun"
    // shows the learner a dangling operator.
    if (pattern.trim().startsWith('+')) {
      throw new Error(`grammar pattern must not start with "+": "${pattern}"`);
    }
  }

  return {
    register: register as [Register, ...Register[]],
    grammarPatterns: patterns as string[],
  };
}

/** Every authored sense attribute, keyed by `senseAttributeKey`. */
export function loadSenseAttributes(): Map<string, SenseAttributes> {
  const dir = new URL('../data/sense-attributes/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.tsv')).sort();

  const attributes = new Map<string, SenseAttributes>();
  const owner = new Map<string, string>();

  for (const filename of files) {
    const text = readFileSync(new URL(filename, dir), 'utf8');
    const [header, ...rows] = text.trimEnd().split('\n');
    if (header !== SENSE_ATTRIBUTE_HEADER) {
      throw new Error(`Unexpected sense-attribute columns in ${filename}`);
    }
    for (const [index, row] of rows.entries()) {
      const columns = row.split('\t');
      // Validate before recording ownership, so a malformed row cannot claim a
      // garbage key and shadow the real one later in the file.
      let parsed: SenseAttributes;
      try {
        parsed = parseSenseAttributeRow(columns);
      } catch (error) {
        throw new Error(`${filename} line ${index + 2}: ${(error as Error).message}`, {
          cause: error,
        });
      }
      const key = senseAttributeKey(columns[0]!, columns[1]!);
      const previous = owner.get(key);
      if (previous) {
        const label = key.replace('\t', '/');
        throw new Error(
          previous === filename
            ? `${filename} line ${index + 2}: duplicate row for sense "${label}"`
            : `Sense "${label}" is authored in both ${previous} and ${filename}`,
        );
      }
      attributes.set(key, parsed);
      owner.set(key, filename);
    }
  }

  return attributes;
}
