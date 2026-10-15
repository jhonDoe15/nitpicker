import { expect } from 'vitest';
export function expectedOutput27_89() {
  return [
    'domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).',
    'domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.',
  ];
}

export function expectedOutput32_50() {
  return [
    'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
  ];
}
