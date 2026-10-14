import { describe, expect, it } from 'vitest';
import { canonicalRule } from './rule-names.mjs';

describe('canonicalRule', () => {
  it.each([
    ['function-lines-limit', 'function-lines-limit'],
    ['structure/function-lines-limit', 'function-lines-limit'],
    ['jacoco/changed-branch-coverage', 'changed-branch-coverage'],
    ['dead-code/exports', 'exports'],
    ['pmd/UnusedPrivateField', 'pmd/UnusedPrivateField'],
    ['react-hooks/exhaustive-deps', 'react-hooks/exhaustive-deps'],
    ['T201', 'T201'],
  ])('%s names %s', (rule, expected) => {
    expect(canonicalRule(rule)).toBe(expected);
  });
});
