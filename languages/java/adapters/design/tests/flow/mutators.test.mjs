import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('mutators');

const MODULES = [
  { file: 'src/main/java/store/Basket.java', role: 'production' },
  { file: 'src/main/java/store/Shelf.java', role: 'production' },
  { file: 'src/main/java/store/Sorting.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'store/Basket.java',
    symbol: 'Basket',
    line: 6,
    kind: 'class',
    fields: [
      { name: 'lines', mutable: true, private: true },
      { name: 'codes', mutable: true, private: true },
    ],
  }),
  type({ file: 'store/Sorting.java', symbol: 'Sorting', line: 8, kind: 'class' }),
];
const TYPES_1 = [
  type({
    file: 'store/Shelf.java',
    symbol: 'Shelf',
    line: 6,
    kind: 'class',
    fields: [
      { name: 'items', mutable: true, private: true },
      { name: 'spare', mutable: true, private: true },
    ],
  }),
];
const CALLABLES_0 = [
  callable({
    file: 'store/Basket.java',
    owner: 'Basket',
    member: 'lines',
    line: 10,
    kind: 'accessor',
    returns: 'List',
    ownFields: ['lines'],
    returnsField: 'lines',
  }),
  callable({
    file: 'store/Basket.java',
    owner: 'Basket',
    member: 'copy',
    line: 14,
    returns: 'List',
    ownFields: ['lines'],
  }),
  callable({
    file: 'store/Basket.java',
    owner: 'Basket',
    member: 'codes',
    line: 18,
    kind: 'accessor',
    returns: 'int[]',
    ownFields: ['codes'],
    returnsField: 'codes',
  }),
  callable({
    file: 'store/Shelf.java',
    owner: 'Shelf',
    member: 'items',
    line: 10,
    kind: 'accessor',
    returns: 'List',
    ownFields: ['items'],
    returnsField: 'items',
  }),
  callable({
    file: 'store/Shelf.java',
    owner: 'Shelf',
    member: 'spare',
    line: 14,
    kind: 'accessor',
    returns: 'List',
    ownFields: ['spare'],
    returnsField: 'spare',
  }),
  callable({
    file: 'store/Shelf.java',
    owner: 'Shelf',
    member: 'count',
    line: 18,
    params: [{ name: 'items', type: 'List' }],
    returns: 'int',
  }),
  callable({ file: 'store/Shelf.java', owner: 'Shelf', member: 'local', line: 23, returns: 'int' }),
];
const CALLABLES_1 = [
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'sorted',
    line: 9,
    params: [{ name: 'basket', type: ref('store/Basket.java', 'Basket') }],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.lines'),
        line: 10,
        receiver: 'basket',
        mutation: 'sort',
      },
    ],
    paramUses: [{ param: 0, fields: ['lines'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines'], line: 10 }],
  }),
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'filled',
    line: 13,
    params: [
      { name: 'basket', type: ref('store/Basket.java', 'Basket') },
      { name: 'item', type: 'String' },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.lines'),
        line: 14,
        receiver: 'basket',
        mutation: 'fill',
      },
    ],
    paramUses: [{ param: 0, fields: ['lines'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines'], line: 14 }],
  }),
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'ordered',
    line: 17,
    params: [{ name: 'basket', type: ref('store/Basket.java', 'Basket') }],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.codes'),
        line: 18,
        receiver: 'basket',
        mutation: 'sort',
      },
    ],
    paramUses: [{ param: 0, fields: ['codes'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['codes'], line: 18 }],
  }),
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'iterated',
    line: 21,
    params: [{ name: 'basket', type: ref('store/Basket.java', 'Basket') }],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.lines'),
        line: 22,
        receiver: 'basket',
        mutation: 'remove',
      },
    ],
    paramUses: [{ param: 0, fields: ['lines'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines'], line: 22 }],
  }),
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'sliced',
    line: 25,
    params: [{ name: 'basket', type: ref('store/Basket.java', 'Basket') }],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.lines'),
        line: 26,
        receiver: 'basket',
        mutation: 'clear',
      },
    ],
    paramUses: [{ param: 0, fields: ['lines'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines'], line: 26 }],
  }),
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'either',
    line: 29,
    params: [
      { name: 'basket', type: ref('store/Basket.java', 'Basket') },
      { name: 'first', type: 'boolean' },
      { name: 'item', type: 'String' },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('store/Basket.java', 'Basket.lines'),
        line: 30,
        receiver: 'basket',
        branch: ['0:then'],
        mutation: 'add',
      },
      {
        target: ref('store/Basket.java', 'Basket.copy'),
        line: 30,
        receiver: 'basket',
        branch: ['0:else'],
        mutation: 'add',
      },
    ],
    paramUses: [{ param: 0, fields: ['lines', 'copy'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines', 'copy'], line: 30 }],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'store/Sorting.java',
    owner: 'Sorting',
    member: 'redeclared',
    line: 34,
    params: [
      { name: 'basket', type: ref('store/Basket.java', 'Basket') },
      { name: 'item', type: 'String' },
    ],
    returns: 'void',
    calls: [{ target: ref('store/Basket.java', 'Basket.lines'), line: 36, receiver: 'basket' }],
    paramUses: [{ param: 0, fields: ['lines'], forwards: [] }],
    reads: [{ type: ref('store/Basket.java', 'Basket'), fields: ['lines'], line: 36 }],
  }),
];

describe('design facts: changes made to a returned collection', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('store/Basket.java', 'Basket'),
      ref('store/Shelf.java', 'Shelf'),
      ref('store/Sorting.java', 'Sorting'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('store/Basket.java', 'Basket.codes'),
      ref('store/Basket.java', 'Basket.copy'),
      ref('store/Basket.java', 'Basket.lines'),
      ref('store/Shelf.java', 'Shelf.count'),
      ref('store/Shelf.java', 'Shelf.items'),
      ref('store/Shelf.java', 'Shelf.local'),
      ref('store/Shelf.java', 'Shelf.spare'),
      ref('store/Sorting.java', 'Sorting.either'),
      ref('store/Sorting.java', 'Sorting.filled'),
      ref('store/Sorting.java', 'Sorting.iterated'),
      ref('store/Sorting.java', 'Sorting.ordered'),
      ref('store/Sorting.java', 'Sorting.redeclared'),
      ref('store/Sorting.java', 'Sorting.sliced'),
      ref('store/Sorting.java', 'Sorting.sorted'),
    ]);
  });

  it.each(TYPES_0)('marks a collection created and never replaced as mutable: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(TYPES_1)(
    'counts only assignments to the field itself, not to a local of its name: $id',
    (expected) => {
      expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_0)('returns the fields it holds: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)(
    'records library mutators, views and ternary aliases of a returned value: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_2)('drops an alias when its name is declared again: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
