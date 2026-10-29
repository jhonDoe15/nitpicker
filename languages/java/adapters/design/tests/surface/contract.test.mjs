import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('contract');

const MODULES = [
  { file: 'src/main/java/zoo/Animal.java', role: 'production' },
  { file: 'src/main/java/zoo/Zoo.java', role: 'production' },
  { file: 'src/main/java/zoo/one/Tag.java', role: 'production' },
  { file: 'src/main/java/zoo/two/Tag.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'zoo/Animal.java',
    symbol: 'Animal',
    line: 6,
    kind: 'class',
    fields: [{ name: 'noises', mutable: true, private: true }],
  }),
  type({ file: 'zoo/Zoo.java', symbol: 'Zoo', line: 3, kind: 'class' }),
  type({ file: 'zoo/Zoo.java', symbol: 'Zoo.Keeper', line: 20, kind: 'class', exported: false }),
];
const TYPES_1 = [
  type({ file: 'zoo/one/Tag.java', symbol: 'Tag', line: 3, kind: 'data' }),
  type({ file: 'zoo/two/Tag.java', symbol: 'Tag', line: 3, kind: 'data' }),
];
const CALLABLES_0 = [
  callable({
    file: 'zoo/Animal.java',
    owner: 'Animal',
    member: 'sound',
    line: 9,
    returns: 'String',
  }),
  callable({
    file: 'zoo/Animal.java',
    owner: 'Animal',
    member: 'noises',
    line: 11,
    kind: 'accessor',
    returns: 'List',
    ownFields: ['noises'],
    returnsField: 'noises',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'zoo/Animal.java',
    owner: 'Animal',
    member: 'twice',
    line: 15,
    exported: false,
    returns: 'String',
    calls: [
      { target: ref('zoo/Animal.java', 'Animal.sound'), line: 16, receiver: 'this' },
      { target: ref('zoo/Animal.java', 'Animal.sound'), line: 16, receiver: 'this' },
    ],
  }),
  callable({
    file: 'zoo/Animal.java',
    owner: 'Animal',
    member: 'quiet',
    line: 19,
    exported: false,
    returns: 'String',
  }),
  callable({
    file: 'zoo/Zoo.java',
    owner: 'Zoo.Keeper',
    member: 'feed',
    line: 21,
    exported: false,
    returns: 'void',
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'zoo/Zoo.java',
    owner: 'Zoo',
    member: 'hear',
    line: 4,
    params: [{ name: 'animal', type: ref('zoo/Animal.java', 'Animal') }],
    returns: 'String',
    forward: { target: ref('zoo/Animal.java', 'Animal.sound'), arguments: [], returned: true },
    calls: [{ target: ref('zoo/Animal.java', 'Animal.sound'), line: 5, receiver: 'animal' }],
    paramUses: [{ param: 0, fields: ['sound'], forwards: [] }],
    reads: [{ type: ref('zoo/Animal.java', 'Animal'), fields: ['sound'], line: 5 }],
  }),
  callable({
    file: 'zoo/Zoo.java',
    owner: 'Zoo',
    member: 'teach',
    line: 8,
    params: [{ name: 'animal', type: ref('zoo/Animal.java', 'Animal') }],
    returns: 'void',
    calls: [
      {
        target: ref('zoo/Animal.java', 'Animal.noises'),
        line: 9,
        receiver: 'animal',
        mutation: 'add',
      },
    ],
    paramUses: [{ param: 0, fields: ['noises'], forwards: [] }],
    reads: [{ type: ref('zoo/Animal.java', 'Animal'), fields: ['noises'], line: 9 }],
  }),
];
const CALLABLES_3 = [
  callable({
    file: 'zoo/Zoo.java',
    owner: 'Zoo',
    member: 'take(zoo.one.Tag)',
    line: 12,
    name: 'take',
    params: [{ name: 'tag', type: ref('zoo/one/Tag.java', 'Tag') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'zoo/Zoo.java',
    owner: 'Zoo',
    member: 'take(zoo.two.Tag)',
    line: 16,
    name: 'take',
    params: [{ name: 'tag', type: ref('zoo/two/Tag.java', 'Tag') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
];

describe('design facts: abstract targets, public surface and overload ids', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('zoo/Animal.java', 'Animal'),
      ref('zoo/Zoo.java', 'Zoo'),
      ref('zoo/Zoo.java', 'Zoo.Keeper'),
      ref('zoo/one/Tag.java', 'Tag'),
      ref('zoo/two/Tag.java', 'Tag'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('zoo/Animal.java', 'Animal.noises'),
      ref('zoo/Animal.java', 'Animal.quiet'),
      ref('zoo/Animal.java', 'Animal.sound'),
      ref('zoo/Animal.java', 'Animal.twice'),
      ref('zoo/Zoo.java', 'Zoo.Keeper.feed'),
      ref('zoo/Zoo.java', 'Zoo.hear'),
      ref('zoo/Zoo.java', 'Zoo.take(zoo.one.Tag)'),
      ref('zoo/Zoo.java', 'Zoo.take(zoo.two.Tag)'),
      ref('zoo/Zoo.java', 'Zoo.teach'),
    ]);
  });

  it.each(TYPES_0)(
    'counts a protected field as private and a protected nested type as not exported: $id',
    (expected) => {
      expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(TYPES_1)('keeps two types of one name in different packages apart: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('gives an abstract method a site with no body facts: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('exports only public members: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)(
    'targets the abstract method through an abstract-typed receiver: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_3)(
    'tells overloads apart by the written parameter type when the simple names clash: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );
});
