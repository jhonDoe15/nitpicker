import { describe, expect, it } from 'vitest';
import { KIND_LABELS } from './taxonomy.mts';
import { PRIORITY_KINDS, primaryKind, priorityRank } from './finding-priority.mts';

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

  it('puts a finding without a kind after every kind', () => {
    expect(priorityRank(['react'])).toBe(PRIORITY_KINDS.length);
    expect(priorityRank([])).toBeGreaterThan(priorityRank(['style']));
  });
});
