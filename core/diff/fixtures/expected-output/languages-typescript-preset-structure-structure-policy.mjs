import { expect } from 'vitest';
export function expectedOutput21_17() {
  return {
    source: 'simple.ts',
    function: 'add',
    start: 1,
    end: 1,
    lines: 1,
    parameters: 2,
    statements: 1,
    maxControlNesting: 0,
  };
}

export function expectedOutput22_18() {
  return { source: 'simple.ts', class: 'Tiny', start: 2, end: 2, lines: 1, members: 1, methods: 1 };
}

export function expectedOutput33_21() {
  return {
    source: 'fixture/src/main/complex.ts',
    function: 'coordinate',
    start: 1,
    end: 17,
    lines: 17,
    parameters: 5,
    statements: 6,
    maxControlNesting: 3,
  };
}
