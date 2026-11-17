import { describe, expect, it } from 'vitest';
import { KIND_LABELS } from './taxonomy.mts';
import { PRIORITY_KINDS, isBroadRule, primaryKind, priorityRank } from './finding-priority.mts';

describe('finding priority', () => {
  it('ranks every kind once, bug first and style last', () => {
    expect(PRIORITY_KINDS.toSorted()).toEqual(KIND_LABELS.map(([label]) => label).toSorted());
    expect(PRIORITY_KINDS[0]).toBe('bug');
    expect(PRIORITY_KINDS.at(-1)).toBe('style');
  });

  it('ranks a finding by its first kind and ignores framework labels', () => {
    expect(primaryKind(['spring', 'performance', 'bug'])).toBe('performance');
    expect(priorityRank(['bug', 'style'])).toBeLessThan(priorityRank(['performance']));
    expect(priorityRank(['maintainability'])).toBeLessThan(priorityRank(['simplification']));
  });

  it('puts every targeted finding before the broad ones, and style after both', () => {
    expect(priorityRank(['tests'])).toBeLessThan(priorityRank(['bug'], true));
    expect(priorityRank(['bug'], true)).toBeLessThan(priorityRank(['maintainability'], true));
    expect(priorityRank(['simplification'], true)).toBeLessThan(priorityRank(['style']));
    expect(priorityRank(['style'], true)).toBe(priorityRank(['style']));
  });

  it('puts a finding without a kind after every kind of its tier', () => {
    expect(priorityRank(['react'])).toBe(PRIORITY_KINDS.length);
    expect(priorityRank([])).toBeLessThan(priorityRank(['bug'], true));
  });

  it.each([
    ['errorprone', 'CheckReturnValue', true],
    ['errorprone', 'NullAway', true],
    ['eslint-lint', 'nitpicker/no-presence-truthiness', true],
    ['python-rules', 'presence-truthiness', true],
    ['duplicates', 'duplicate-clone', true],
    ['exhaustive', 'exhaustive', true],
    ['go-rules', 'repeated_string_literal', true],
    ['pmd', 'MaxValueOverflow', false],
    ['typescript-typecheck', 'TS2345', false],
    ['mypy', 'arg-type', false],
    ['go-rules', 'io_in_loop', false],
    ['custom', 'anything', false],
  ])('tells whether %s/%s is a broad rule', (tool, rule, broad) => {
    expect(isBroadRule({ tool, rule })).toBe(broad);
  });
});
