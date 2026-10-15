import { expect } from 'vitest';
export function expectedOutput69_42() {
  return {
    path: 'src/main/a.ts',
    added: false,
    ranges: [
      [4, 5],
      [22, 22],
    ],
    inserted: [[4, 5]],
  };
}

export function expectedOutput77_42() {
  return { path: 'src/main/b.ts', added: true, ranges: [[1, 4]], inserted: [[1, 4]] };
}

export function expectedOutput83_51() {
  return { path: 'src/main/with space.ts', added: false, ranges: [[1, 1]], inserted: [] };
}

export function expectedOutput98_37() {
  return {
    path: 'src/a.ts',
    added: false,
    ranges: [
      [5, 8],
      [22, 23],
      [33, 33],
    ],
    inserted: [[7, 8]],
  };
}

export function expectedOutput121_37() {
  return { path: 'src/a.ts', added: false, ranges: [[43, 44]], inserted: [[43, 43]] };
}

export function expectedOutput157_37() {
  return { path: 'src/a.ts', added: false, ranges: [[7, 7]], inserted: [[7, 7]] };
}

export function expectedOutput163_33() {
  return ['main/a.ts', 'main/b.ts', 'main/with space.ts'];
}

export function expectedOutput201_37() {
  return { path: 'src/a.ts', added: false, ranges: [[6, 6]], inserted: [] };
}

export function expectedOutput202_41() {
  return { path: 'src/fresh.ts', added: true, ranges: [[1, 1]], inserted: [[1, 1]] };
}
