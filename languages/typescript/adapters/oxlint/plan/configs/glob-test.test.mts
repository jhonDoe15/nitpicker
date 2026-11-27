import { describe, expect, it, vi } from 'vitest';

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (from: string | URL) => {
      const real = actual.createRequire(from);
      return Object.assign((id: string): unknown => (id === 'minimatch' ? {} : real(id)), real);
    },
  };
});

const { globTests } = await import('./glob-test.mts');

describe('glob tests on the minimatch ESLint uses', () => {
  it('says so when that minimatch has no Minimatch class', () => {
    expect(() => globTests('src/**')).toThrow('minimatch is not available');
  });
});
