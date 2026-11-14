import { describe, expect, it } from 'vitest';
import { describePolicyChanges } from '../describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from '../policy-scope.mjs';

const runners = (names) => ({ conventions: { 'typescript.detachedWorkRunners': names } });

function changes(baseConfig, headConfig) {
  return describePolicyChanges(
    baseConfig,
    headConfig,
    createPolicyScope({
      files: ['src/a.ts'],
      baseFiles: ['src/a.ts'],
      baseRoots: rootSets(baseConfig, '.'),
      headRoots: rootSets(headConfig, '.'),
      headConfig,
    }),
  );
}

describe('detached-work runner pins', () => {
  it('counts a newly named runner as a loosening', () => {
    expect(changes(runners(['runDetached']), runners(['runDetached', 'enqueue']))).toEqual({
      loosened: [
        'conventions.typescript.detachedWorkRunners: ["runDetached"] -> ["runDetached","enqueue"]',
      ],
      changed: [],
    });
    expect(changes({}, runners(['runDetached'])).loosened).toHaveLength(1);
  });

  it('lists a removed runner as a plain change', () => {
    expect(changes(runners(['runDetached', 'enqueue']), runners(['enqueue']))).toEqual({
      loosened: [],
      changed: [
        'conventions.typescript.detachedWorkRunners: ["runDetached","enqueue"] -> ["enqueue"]',
      ],
    });
  });

  it('counts a newly named Kotlin runner as a loosening', () => {
    const kotlin = (names) => ({ conventions: { 'kotlin.detachedWorkRunners': names } });
    expect(changes({}, kotlin(['runDetached'])).loosened).toHaveLength(1);
  });
});
