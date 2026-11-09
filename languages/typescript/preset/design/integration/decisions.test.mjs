import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFixture } from '../test-support/project.mjs';

let facts;

beforeAll(() => {
  facts = factsOfFixture('decisions');
});

describe('the decisions of a fixture project', () => {
  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it('lists the enum and literal union types with their cases', () => {
    expect(facts.types.filter(({ kind }) => kind === 'enum')).toEqual([
      {
        id: 'src/decisions.ts#Mode',
        file: 'src/decisions.ts',
        name: 'Mode',
        line: 1,
        kind: 'enum',
        exported: true,
        cases: ['fast', 'slow', 'off'],
      },
      {
        id: 'src/decisions.ts#Level',
        file: 'src/decisions.ts',
        name: 'Level',
        line: 3,
        kind: 'enum',
        exported: true,
        cases: ['Low', 'Mid', 'High'],
      },
    ]);
  });

  it.each([
    [
      'src/decisions.ts#Invoice.describe',
      [
        {
          subject: 'src/decisions.ts#Invoice.status',
          groups: [['fast']],
          line: 20,
          otherwise: true,
        },
      ],
    ],
    [
      'src/decisions.ts#bySwitch',
      [{ subject: 'src/decisions.ts#Mode', groups: [['fast', 'slow'], ['off']], line: 30 }],
    ],
    [
      'src/decisions.ts#withDefault',
      [{ subject: 'src/decisions.ts#Mode', groups: [['fast']], line: 41, otherwise: true }],
    ],
    [
      'src/decisions.ts#chain',
      [
        {
          subject: 'src/decisions.ts#Mode',
          groups: [['fast', 'slow'], ['off']],
          line: 50,
          otherwise: true,
        },
      ],
    ],
    [
      'src/decisions.ts#includesTuple',
      [{ subject: 'src/decisions.ts#Mode', groups: [['fast', 'slow']], line: 60 }],
    ],
    [
      'src/decisions.ts#ternary',
      [
        {
          subject: 'src/decisions.ts#Mode',
          groups: [['fast'], ['slow']],
          line: 67,
          otherwise: true,
        },
      ],
    ],
    [
      'src/decisions.ts#fieldSwitch',
      [{ subject: 'src/decisions.ts#Order.status', groups: [['fast'], ['off']], line: 71 }],
    ],
    [
      'src/decisions.ts#enumChain',
      [{ subject: 'src/decisions.ts#Level', groups: [['Low'], ['High']], line: 81 }],
    ],
    [
      'src/decisions.ts#mixedChain',
      [
        { subject: 'src/decisions.ts#Mode', groups: [['fast']], line: 90, otherwise: true },
        { subject: 'src/decisions.ts#Mode', groups: [['slow']], line: 92 },
      ],
    ],
    ['src/decisions.ts#plainText', undefined],
    ['src/decisions.ts#nonConstant', undefined],
    [
      'src/decisions.ts#optionalMode',
      [{ subject: 'src/decisions.ts#Mode', groups: [['off']], line: 115 }],
    ],
    ['src/decisions.ts#negated', undefined],
    ['src/decisions.ts#plainSwitch', undefined],
    ['src/decisions.ts#readsDecide', undefined],
  ])('lists the decisions of %s', (id, expected) => {
    expect(byId(facts.callables, id).decisions).toEqual(expected);
  });

  it.each([
    [
      'src/decisions.ts#fieldSwitch',
      [{ type: 'src/decisions.ts#Order', fields: ['status'], line: 71, decided: ['status'] }],
    ],
    [
      'src/decisions.ts#readsDecide',
      [
        {
          type: 'src/decisions.ts#Order',
          fields: ['total', 'id', 'level'],
          line: 139,
          decided: ['total', 'id'],
        },
      ],
    ],
  ])('lists the reads of %s with the fields that decide', (id, expected) => {
    expect(byId(facts.callables, id).reads).toEqual(expected);
  });

  it.each([
    ['src/resources.ts#Handle.[Symbol.dispose]', undefined],
    ['src/resources.ts#Handle.write', undefined],
    [
      'src/resources.ts#useHandle',
      [
        { target: 'src/resources.ts#Handle.write', line: 9, receiver: 'handle' },
        {
          target: 'src/resources.ts#Handle.[Symbol.dispose]',
          line: 8,
          receiver: 'handle',
          cleanup: true,
        },
      ],
    ],
  ])(
    'lists the calls of %s, with the disposal of a using declaration as a cleanup',
    (id, expected) => {
      expect(byId(facts.callables, id).calls).toEqual(expected);
    },
  );
});
