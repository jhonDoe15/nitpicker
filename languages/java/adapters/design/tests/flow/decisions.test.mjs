import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('decisions');

const MODULES = [
  { file: 'src/main/java/rules/Account.java', role: 'production' },
  { file: 'src/main/java/rules/Kind.java', role: 'production' },
  { file: 'src/main/java/rules/Policy.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'rules/Account.java',
    symbol: 'Account',
    line: 5,
    kind: 'class',
    fields: [
      { name: 'kind' },
      { name: 'tier' },
      { name: 'region', private: true },
      { name: 'level', private: true },
    ],
  }),
  type({
    file: 'rules/Kind.java',
    symbol: 'Kind',
    line: 3,
    kind: 'enum',
    fields: [{ name: 'rank', private: true }],
    cases: ['BASIC', 'PLUS', 'PRO', 'TRIAL'],
  }),
  type({ file: 'rules/Policy.java', symbol: 'Policy', line: 3, kind: 'class' }),
];
const CALLABLES_0 = [
  callable({
    file: 'rules/Account.java',
    owner: 'Account',
    member: 'getRegion',
    line: 11,
    kind: 'accessor',
    returns: 'String',
    ownFields: ['region'],
    returnsField: 'region',
  }),
  callable({
    file: 'rules/Account.java',
    owner: 'Account',
    member: 'level',
    line: 15,
    kind: 'accessor',
    returns: 'int',
    ownFields: ['level'],
    returnsField: 'level',
  }),
  callable({
    file: 'rules/Account.java',
    owner: 'Account',
    member: 'premium',
    line: 19,
    returns: 'boolean',
    ownFields: ['kind'],
    decisions: [{ subject: ref('rules/Kind.java', 'Kind'), groups: [['PLUS', 'PRO']], line: 20 }],
  }),
  callable({
    file: 'rules/Account.java',
    owner: 'Account',
    member: 'fee',
    line: 23,
    returns: 'int',
    ownFields: ['kind'],
    decisions: [
      {
        subject: ref('rules/Kind.java', 'Kind'),
        groups: [['BASIC', 'TRIAL'], ['PLUS']],
        line: 24,
        otherwise: true,
      },
    ],
  }),
  callable({
    file: 'rules/Account.java',
    owner: 'Account',
    member: 'label',
    line: 35,
    returns: 'String',
    ownFields: ['tier'],
    decisions: [
      {
        subject: ref('rules/Account.java', 'Account.tier'),
        groups: [['gold'], ['silver', 'bronze']],
        line: 36,
        otherwise: true,
      },
    ],
  }),
  callable({
    file: 'rules/Kind.java',
    owner: 'Kind',
    member: 'rank',
    line: 11,
    kind: 'accessor',
    returns: 'int',
    ownFields: ['rank'],
    returnsField: 'rank',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'discount',
    line: 4,
    params: [{ name: 'account', type: ref('rules/Account.java', 'Account') }],
    returns: 'int',
    paramUses: [{ param: 0, fields: ['kind'], forwards: [] }],
    decisions: [
      {
        subject: ref('rules/Kind.java', 'Kind'),
        groups: [['BASIC', 'TRIAL'], ['PLUS'], ['PRO']],
        line: 5,
      },
    ],
    reads: [
      { type: ref('rules/Account.java', 'Account'), fields: ['kind'], decided: ['kind'], line: 5 },
    ],
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'quota',
    line: 12,
    params: [{ name: 'kind', type: ref('rules/Kind.java', 'Kind') }],
    returns: 'String',
    decisions: [
      { subject: ref('rules/Kind.java', 'Kind'), groups: [['BASIC', 'TRIAL'], ['PLUS']], line: 13 },
    ],
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'region',
    line: 21,
    params: [{ name: 'account', type: ref('rules/Account.java', 'Account') }],
    returns: 'int',
    calls: [
      { target: ref('rules/Account.java', 'Account.getRegion'), line: 22, receiver: 'account' },
    ],
    paramUses: [{ param: 0, fields: ['region'], forwards: [] }],
    decisions: [
      {
        subject: ref('rules/Account.java', 'Account.region'),
        groups: [['eu', 'uk'], ['us']],
        line: 22,
      },
    ],
    reads: [
      {
        type: ref('rules/Account.java', 'Account'),
        fields: ['region'],
        decided: ['region'],
        line: 22,
      },
    ],
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'levels',
    line: 32,
    params: [{ name: 'account', type: ref('rules/Account.java', 'Account') }],
    returns: 'int',
    calls: [{ target: ref('rules/Account.java', 'Account.level'), line: 33, receiver: 'account' }],
    paramUses: [{ param: 0, fields: ['level'], forwards: [] }],
    decisions: [
      {
        subject: ref('rules/Account.java', 'Account.level'),
        groups: [['1', '2']],
        line: 33,
        otherwise: true,
      },
    ],
    reads: [
      {
        type: ref('rules/Account.java', 'Account'),
        fields: ['level'],
        decided: ['level'],
        line: 33,
      },
    ],
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'cascade',
    line: 39,
    params: [
      { name: 'account', type: ref('rules/Account.java', 'Account') },
      { name: 'kind', type: ref('rules/Kind.java', 'Kind') },
    ],
    returns: 'String',
    paramUses: [{ param: 0, fields: ['tier'], forwards: [] }],
    decisions: [
      { subject: ref('rules/Account.java', 'Account.tier'), groups: [['x']], line: 40 },
      { subject: ref('rules/Kind.java', 'Kind'), groups: [['PRO']], line: 42 },
      { subject: ref('rules/Account.java', 'Account.tier'), groups: [['y']], line: 44 },
    ],
    reads: [
      { type: ref('rules/Account.java', 'Account'), fields: ['tier'], decided: ['tier'], line: 40 },
    ],
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'patterns',
    line: 50,
    params: [{ name: 'value', type: 'Object' }],
    returns: 'boolean',
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'local',
    line: 57,
    params: [
      { name: 'code', type: 'int' },
      { name: 'name', type: 'String' },
    ],
    returns: 'boolean',
  }),
  callable({
    file: 'rules/Policy.java',
    owner: 'Policy',
    member: 'exposed',
    line: 64,
    params: [{ name: 'account', type: ref('rules/Account.java', 'Account') }],
    returns: 'int',
    calls: [
      { target: ref('rules/Account.java', 'Account.premium'), line: 66, receiver: 'account' },
      {
        target: ref('rules/Account.java', 'Account.level'),
        line: 67,
        receiver: 'account',
        branch: ['0:then'],
      },
      { target: ref('rules/Account.java', 'Account.getRegion'), line: 69, receiver: 'account' },
    ],
    paramUses: [{ param: 0, fields: ['premium', 'kind', 'level', 'region', 'tier'], forwards: [] }],
    reads: [
      {
        type: ref('rules/Account.java', 'Account'),
        fields: ['premium', 'kind', 'level', 'region', 'tier'],
        decided: ['premium', 'kind', 'region', 'tier'],
        line: 66,
      },
    ],
  }),
];

describe('design facts: decisions made on a field or a parameter', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('rules/Account.java', 'Account'),
      ref('rules/Kind.java', 'Kind'),
      ref('rules/Policy.java', 'Policy'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('rules/Account.java', 'Account.fee'),
      ref('rules/Account.java', 'Account.getRegion'),
      ref('rules/Account.java', 'Account.label'),
      ref('rules/Account.java', 'Account.level'),
      ref('rules/Account.java', 'Account.premium'),
      ref('rules/Kind.java', 'Kind.rank'),
      ref('rules/Policy.java', 'Policy.cascade'),
      ref('rules/Policy.java', 'Policy.discount'),
      ref('rules/Policy.java', 'Policy.exposed'),
      ref('rules/Policy.java', 'Policy.levels'),
      ref('rules/Policy.java', 'Policy.local'),
      ref('rules/Policy.java', 'Policy.patterns'),
      ref('rules/Policy.java', 'Policy.quota'),
      ref('rules/Policy.java', 'Policy.region'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('reads fields and records the ones that decide: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('records equality chains, switches and groups: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
