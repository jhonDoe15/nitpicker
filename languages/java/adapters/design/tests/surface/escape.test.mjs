import { describe, expect, it } from 'vitest';
import {
  accessor,
  callable,
  fixtureFacts,
  ref,
  type,
} from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('escape');

const MODULES = [
  { file: 'src/main/java/shop/model/Cart.java', role: 'production' },
  { file: 'src/main/java/shop/model/Item.java', role: 'production' },
  { file: 'src/main/java/shop/service/Checkout.java', role: 'production' },
];
const TYPES_0 = [
  type({
    file: 'shop/model/Cart.java',
    symbol: 'Cart',
    line: 7,
    kind: 'class',
    fields: [
      { name: 'items', mutable: true, private: true },
      { name: 'pending', mutable: true, private: true },
      { name: 'owner', private: true },
    ],
  }),
  type({ file: 'shop/service/Checkout.java', symbol: 'Checkout', line: 7, kind: 'class' }),
];
const TYPES_1 = [
  type({
    file: 'shop/model/Item.java',
    symbol: 'Item',
    line: 3,
    kind: 'data',
    fields: [
      { name: 'name', private: true },
      { name: 'price', private: true },
    ],
  }),
];
const CALLABLES_0 = [
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: '<init>',
    line: 12,
    name: 'Cart',
    kind: 'constructor',
    params: [{ name: 'owner', type: 'String' }],
    ownFields: ['owner', 'pending'],
  }),
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'lines',
    line: 17,
    kind: 'accessor',
    returns: 'List',
    ownFields: ['items'],
    returnsField: 'items',
  }),
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'queued',
    line: 29,
    params: [{ name: 'ready', type: 'boolean' }],
    returns: 'List',
    calls: [{ target: ref('shop/model/Cart.java', 'Cart.copy'), line: 30, receiver: 'this' }],
    ownFields: ['pending'],
    returnsField: 'pending',
  }),
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'owner',
    line: 37,
    kind: 'accessor',
    returns: 'String',
    ownFields: ['owner'],
    returnsField: 'owner',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'copy',
    line: 21,
    returns: 'List',
    ownFields: ['items'],
  }),
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'view',
    line: 25,
    returns: 'List',
    ownFields: ['items'],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'shop/model/Cart.java',
    owner: 'Cart',
    member: 'add',
    line: 33,
    params: [{ name: 'item', type: ref('shop/model/Item.java', 'Item') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    ownFields: ['items'],
  }),
];
const CALLABLES_3 = [
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'direct',
    line: 8,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('shop/model/Cart.java', 'Cart.lines'),
        line: 9,
        receiver: 'c',
        mutation: 'add',
      },
    ],
    paramUses: [
      { param: 0, fields: ['items'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['items'], line: 9 }],
  }),
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'aliased',
    line: 12,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('shop/model/Cart.java', 'Cart.lines'),
        line: 13,
        receiver: 'c',
        mutation: 'add',
      },
    ],
    paramUses: [
      { param: 0, fields: ['items'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['items'], line: 13 }],
  }),
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'copied',
    line: 23,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('shop/model/Cart.java', 'Cart.copy'),
        line: 24,
        receiver: 'c',
        mutation: 'add',
      },
    ],
    paramUses: [
      { param: 0, fields: ['copy'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['copy'], line: 24 }],
  }),
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'viewed',
    line: 27,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('shop/model/Cart.java', 'Cart.view'),
        line: 28,
        receiver: 'c',
        mutation: 'add',
      },
    ],
    paramUses: [
      { param: 0, fields: ['view'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['view'], line: 28 }],
  }),
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'queued',
    line: 31,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      {
        target: ref('shop/model/Cart.java', 'Cart.queued'),
        line: 32,
        receiver: 'c',
        mutation: 'add',
      },
    ],
    paramUses: [
      { param: 0, fields: ['queued'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['queued'], line: 32 }],
  }),
];
const CALLABLES_4 = [
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'reassigned',
    line: 17,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [
      { target: ref('shop/model/Cart.java', 'Cart.lines'), line: 18, receiver: 'c' },
      { target: ref('shop/model/Cart.java', 'Cart.copy'), line: 19, receiver: 'c' },
    ],
    paramUses: [
      { param: 0, fields: ['items', 'copy'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['items', 'copy'], line: 18 }],
  }),
  callable({
    file: 'shop/service/Checkout.java',
    owner: 'Checkout',
    member: 'wrapped',
    line: 35,
    params: [
      { name: 'c', type: ref('shop/model/Cart.java', 'Cart') },
      { name: 'item', type: ref('shop/model/Item.java', 'Item') },
    ],
    returns: 'void',
    calls: [{ target: ref('shop/model/Cart.java', 'Cart.lines'), line: 36, receiver: 'c' }],
    paramUses: [
      { param: 0, fields: ['items'], forwards: [] },
      { param: 1, fields: [], forwards: [], opaque: true },
    ],
    reads: [{ type: ref('shop/model/Cart.java', 'Cart'), fields: ['items'], line: 36 }],
  }),
];
const CALLABLES_5 = [
  accessor({
    file: 'shop/model/Item.java',
    owner: 'Item',
    member: 'name',
    line: 3,
    returns: 'String',
  }),
  accessor({
    file: 'shop/model/Item.java',
    owner: 'Item',
    member: 'price',
    line: 3,
    returns: 'int',
  }),
];

describe('design facts: state that escapes through an accessor', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('shop/model/Cart.java', 'Cart'),
      ref('shop/model/Item.java', 'Item'),
      ref('shop/service/Checkout.java', 'Checkout'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('shop/model/Cart.java', 'Cart.<init>'),
      ref('shop/model/Cart.java', 'Cart.add'),
      ref('shop/model/Cart.java', 'Cart.copy'),
      ref('shop/model/Cart.java', 'Cart.lines'),
      ref('shop/model/Cart.java', 'Cart.owner'),
      ref('shop/model/Cart.java', 'Cart.queued'),
      ref('shop/model/Cart.java', 'Cart.view'),
      ref('shop/model/Item.java', 'Item.name'),
      ref('shop/model/Item.java', 'Item.price'),
      ref('shop/service/Checkout.java', 'Checkout.aliased'),
      ref('shop/service/Checkout.java', 'Checkout.copied'),
      ref('shop/service/Checkout.java', 'Checkout.direct'),
      ref('shop/service/Checkout.java', 'Checkout.queued'),
      ref('shop/service/Checkout.java', 'Checkout.reassigned'),
      ref('shop/service/Checkout.java', 'Checkout.viewed'),
      ref('shop/service/Checkout.java', 'Checkout.wrapped'),
    ]);
  });

  it.each(TYPES_0)('marks a collection created and never replaced as mutable: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(TYPES_1)('reduces a record to its components: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('names the field a member returns itself: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('leaves out a copy and a read-only view of a field: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)('keeps an unrelated mutator without a return: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_3)('records the first change made to a returned value: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_4)(
    'records no change through a reassigned local or a new collection: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_5)('answers record components through implicit accessors: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });
});
