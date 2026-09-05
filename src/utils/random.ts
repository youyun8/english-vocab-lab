/** Deterministic pseudo-random helpers so quiz assembly is testable. */

export type Rng = () => number;

/** mulberry32 - small, fast, and good enough for shuffling quiz options. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = () => Math.random();

/** Fisher-Yates. Returns a new array; never mutates the input. */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/** Picks up to `count` items without replacement. */
export function sample<T>(items: readonly T[], count: number, rng: Rng = defaultRng): T[] {
  if (count >= items.length) return shuffle(items, rng);
  return shuffle(items, rng).slice(0, count);
}
