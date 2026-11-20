import { describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../../shared/rules/facts/schema.mjs';
import { fixtureFacts } from '../../test-support/design-facts-support.mts';

const facts = fixtureFacts('member-types');
const checkFacts: (bundle: unknown) => unknown = validateFacts;

describe('Java design facts for a member type of a parameterized outer type', () => {
  it('names Outer<A, B>.Inner as Outer.Inner in a parameter and a return type', () => {
    const execute = facts.callables.find(({ id }) => id.includes('execute'));
    const current = facts.callables.find(({ id }) => id.includes('current'));

    expect(execute?.['params']).toEqual([
      { name: 'reference', type: 'src/main/java/kin/Replication.java#Replication.Reference' },
      { name: 'attempt', type: 'int' },
    ]);
    expect(current?.['returns']).toBe('src/main/java/kin/Replication.java#Replication.Reference');
  });

  it('passes the facts schema', () => {
    expect(() => checkFacts({ ...facts, version: 1 })).not.toThrow();
  });
});
