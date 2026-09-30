import type { RngState } from "./types";

export function rngFromSeed(seed: number): RngState {
  const s = seed >>> 0;
  return { s: s === 0 ? 1 : s };
}

/** Unit float in [0, 1) and the next generator state. */
export function nextUnit(state: RngState): { value: number; state: RngState } {
  let s = state.s >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: { s } };
}

export function nextInt(state: RngState, maxExclusive: number): { value: number; state: RngState } {
  if (maxExclusive <= 0) return { value: 0, state };
  const roll = nextUnit(state);
  return { value: Math.floor(roll.value * maxExclusive), state: roll.state };
}

/** Fisher–Yates. The returned state must be stored back on the match. */
export function shuffleInPlace<T>(items: T[], state: RngState): RngState {
  let rng = state;
  for (let i = items.length - 1; i > 0; i -= 1) {
    const roll = nextInt(rng, i + 1);
    rng = roll.state;
    const j = roll.value;
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return rng;
}
