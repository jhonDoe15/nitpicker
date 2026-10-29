import { describe, expect, it } from 'vitest';
import {
  accessor,
  callable,
  fixtureFacts,
  ref,
  type,
} from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('hierarchy');

const MODULES = [
  { file: 'src/main/java/kin/AbstractRes.java', role: 'production' },
  { file: 'src/main/java/kin/Labeled.java', role: 'production' },
  { file: 'src/main/java/kin/Level.java', role: 'production' },
  { file: 'src/main/java/kin/Named.java', role: 'production' },
  { file: 'src/main/java/kin/Point.java', role: 'production' },
  { file: 'src/main/java/kin/Pool.java', role: 'production' },
  { file: 'src/main/java/kin/call/Overloads.java', role: 'production' },
  { file: 'src/main/java/kin/call/Users.java', role: 'production' },
];
const TYPES_0 = [
  type({ file: 'kin/AbstractRes.java', symbol: 'AbstractRes', line: 3, kind: 'class' }),
  type({
    file: 'kin/Labeled.java',
    symbol: 'Labeled',
    line: 5,
    kind: 'interface',
    supertypes: [ref('kin/Named.java', 'Named')],
  }),
  type({
    file: 'kin/Level.java',
    symbol: 'Level',
    line: 3,
    kind: 'enum',
    supertypes: [ref('kin/Labeled.java', 'Labeled')],
    cases: ['LOW', 'HIGH'],
  }),
  type({ file: 'kin/Named.java', symbol: 'Named', line: 3, kind: 'interface' }),
  type({
    file: 'kin/Point.java',
    symbol: 'Point',
    line: 3,
    kind: 'data',
    fields: [
      { name: 'name', private: true },
      { name: 'x', private: true },
    ],
    supertypes: [ref('kin/Named.java', 'Named')],
  }),
  type({
    file: 'kin/Pool.java',
    symbol: 'Pool',
    line: 3,
    kind: 'class',
    supertypes: [ref('kin/AbstractRes.java', 'AbstractRes'), ref('kin/Named.java', 'Named')],
  }),
];
const TYPES_1 = [
  type({ file: 'kin/call/Overloads.java', symbol: 'Overloads', line: 8, kind: 'class' }),
  type({ file: 'kin/call/Overloads.java', symbol: 'Overloads.Finder', line: 9, kind: 'interface' }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.Store',
    line: 13,
    kind: 'class',
    supertypes: [ref('kin/call/Overloads.java', 'Overloads.Finder')],
  }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.Visitor',
    line: 24,
    kind: 'interface',
  }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.Printer',
    line: 30,
    kind: 'class',
    supertypes: [ref('kin/call/Overloads.java', 'Overloads.Visitor')],
  }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.Handler',
    line: 38,
    kind: 'interface',
  }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.TextHandler',
    line: 42,
    kind: 'class',
    supertypes: [ref('kin/call/Overloads.java', 'Overloads.Handler')],
  }),
  type({
    file: 'kin/call/Overloads.java',
    symbol: 'Overloads.CountHandler',
    line: 59,
    kind: 'class',
    supertypes: [ref('kin/call/Overloads.java', 'Overloads.Handler')],
  }),
  type({ file: 'kin/call/Users.java', symbol: 'Users', line: 5, kind: 'class' }),
];
const CALLABLES_0 = [
  callable({
    file: 'kin/AbstractRes.java',
    owner: 'AbstractRes',
    member: 'close',
    line: 4,
    entry: true,
    returns: 'void',
  }),
  callable({
    file: 'kin/Labeled.java',
    owner: 'Labeled',
    member: 'label',
    line: 6,
    returns: 'String',
    calls: [{ target: ref('kin/Named.java', 'Named.name'), line: 7, receiver: 'this' }],
  }),
  callable({ file: 'kin/Named.java', owner: 'Named', member: 'name', line: 4, returns: 'String' }),
  accessor({ file: 'kin/Point.java', owner: 'Point', member: 'name', line: 3, returns: 'String' }),
  accessor({ file: 'kin/Point.java', owner: 'Point', member: 'x', line: 3, returns: 'int' }),
  callable({ file: 'kin/Pool.java', owner: 'Pool', member: 'acquire', line: 4, returns: 'void' }),
  callable({
    file: 'kin/Pool.java',
    owner: 'Pool',
    member: 'name',
    line: 6,
    entry: true,
    returns: 'String',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Finder',
    member: 'find',
    line: 10,
    params: [{ name: 'key', type: 'String' }],
    returns: 'String',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Store',
    member: 'find(String)',
    line: 14,
    name: 'find',
    entry: true,
    params: [{ name: 'key', type: 'String' }],
    returns: 'String',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Store',
    member: 'find(Integer)',
    line: 19,
    name: 'find',
    params: [{ name: 'id', type: 'Integer' }],
    returns: 'String',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Visitor',
    member: 'visit(Pool)',
    line: 25,
    name: 'visit',
    params: [{ name: 'pool', type: ref('kin/Pool.java', 'Pool') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Visitor',
    member: 'visit(Point)',
    line: 27,
    name: 'visit',
    params: [{ name: 'point', type: ref('kin/Point.java', 'Point') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Printer',
    member: 'visit(Pool)',
    line: 31,
    name: 'visit',
    entry: true,
    params: [{ name: 'pool', type: ref('kin/Pool.java', 'Pool') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [] }],
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Printer',
    member: 'visit(Point)',
    line: 34,
    name: 'visit',
    entry: true,
    params: [{ name: 'point', type: ref('kin/Point.java', 'Point') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: [], forwards: [] }],
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.Handler',
    member: 'handle',
    line: 39,
    params: [{ name: 'value', type: 'T' }],
    returns: 'void',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.TextHandler',
    member: 'handle',
    line: 43,
    entry: true,
    params: [{ name: 'value', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads.CountHandler',
    member: 'handle',
    line: 60,
    entry: true,
    params: [{ name: 'value', type: 'Integer' }],
    returns: 'void',
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads',
    member: 'notEmpty(T,String)',
    line: 47,
    name: 'notEmpty',
    params: [
      { name: 'value', type: 'T' },
      { name: 'message', type: 'String' },
    ],
    returns: 'T',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads',
    member: 'notEmpty(T,String)~2',
    line: 51,
    name: 'notEmpty',
    params: [
      { name: 'value', type: 'T' },
      { name: 'message', type: 'String' },
    ],
    returns: 'T',
  }),
  callable({
    file: 'kin/call/Overloads.java',
    owner: 'Overloads',
    member: 'notEmpty(T,String)~3',
    line: 55,
    name: 'notEmpty',
    params: [
      { name: 'value', type: 'T' },
      { name: 'message', type: 'String' },
    ],
    returns: 'T',
  }),
];
const CALLABLES_3 = [
  callable({
    file: 'kin/call/Users.java',
    owner: 'Users',
    member: 'pooled',
    line: 6,
    returns: 'void',
    calls: [
      { target: ref('kin/Pool.java', 'Pool.acquire'), line: 8, receiver: 'pool' },
      {
        target: ref('kin/AbstractRes.java', 'AbstractRes.close'),
        line: 7,
        receiver: 'pool',
        cleanup: true,
      },
    ],
    reads: [{ type: ref('kin/Pool.java', 'Pool'), fields: ['acquire'], line: 8 }],
  }),
  callable({
    file: 'kin/call/Users.java',
    owner: 'Users',
    member: 'leaked',
    line: 12,
    returns: 'void',
    calls: [{ target: ref('kin/Pool.java', 'Pool.acquire'), line: 14, receiver: 'pool' }],
    reads: [{ type: ref('kin/Pool.java', 'Pool'), fields: ['acquire'], line: 14 }],
  }),
  callable({
    file: 'kin/call/Users.java',
    owner: 'Users',
    member: 'lookup',
    line: 17,
    params: [{ name: 'store', type: ref('kin/call/Overloads.java', 'Overloads.Store') }],
    returns: 'String',
    paramUses: [{ param: 0, fields: ['find'], forwards: [] }],
    reads: [
      { type: ref('kin/call/Overloads.java', 'Overloads.Store'), fields: ['find'], line: 18 },
    ],
  }),
  callable({
    file: 'kin/call/Users.java',
    owner: 'Users',
    member: 'print',
    line: 21,
    params: [{ name: 'printer', type: ref('kin/call/Overloads.java', 'Overloads.Printer') }],
    returns: 'void',
    paramUses: [{ param: 0, fields: ['visit'], forwards: [] }],
    reads: [
      { type: ref('kin/call/Overloads.java', 'Overloads.Printer'), fields: ['visit'], line: 22 },
    ],
  }),
  callable({
    file: 'kin/call/Users.java',
    owner: 'Users',
    member: 'handle',
    line: 25,
    params: [{ name: 'handler', type: ref('kin/call/Overloads.java', 'Overloads.TextHandler') }],
    returns: 'void',
    calls: [
      {
        target: ref('kin/call/Overloads.java', 'Overloads.TextHandler.handle'),
        line: 26,
        receiver: 'handler',
      },
    ],
    paramUses: [{ param: 0, fields: ['handle'], forwards: [] }],
    reads: [
      {
        type: ref('kin/call/Overloads.java', 'Overloads.TextHandler'),
        fields: ['handle'],
        line: 26,
      },
    ],
  }),
];

describe('design facts: supertypes and overloads across a hierarchy', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('kin/AbstractRes.java', 'AbstractRes'),
      ref('kin/Labeled.java', 'Labeled'),
      ref('kin/Level.java', 'Level'),
      ref('kin/Named.java', 'Named'),
      ref('kin/Point.java', 'Point'),
      ref('kin/Pool.java', 'Pool'),
      ref('kin/call/Overloads.java', 'Overloads'),
      ref('kin/call/Overloads.java', 'Overloads.CountHandler'),
      ref('kin/call/Overloads.java', 'Overloads.Finder'),
      ref('kin/call/Overloads.java', 'Overloads.Handler'),
      ref('kin/call/Overloads.java', 'Overloads.Printer'),
      ref('kin/call/Overloads.java', 'Overloads.Store'),
      ref('kin/call/Overloads.java', 'Overloads.TextHandler'),
      ref('kin/call/Overloads.java', 'Overloads.Visitor'),
      ref('kin/call/Users.java', 'Users'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('kin/AbstractRes.java', 'AbstractRes.close'),
      ref('kin/Labeled.java', 'Labeled.label'),
      ref('kin/Named.java', 'Named.name'),
      ref('kin/Point.java', 'Point.name'),
      ref('kin/Point.java', 'Point.x'),
      ref('kin/Pool.java', 'Pool.acquire'),
      ref('kin/Pool.java', 'Pool.name'),
      ref('kin/call/Overloads.java', 'Overloads.CountHandler.handle'),
      ref('kin/call/Overloads.java', 'Overloads.Finder.find'),
      ref('kin/call/Overloads.java', 'Overloads.Handler.handle'),
      ref('kin/call/Overloads.java', 'Overloads.Printer.visit(Point)'),
      ref('kin/call/Overloads.java', 'Overloads.Printer.visit(Pool)'),
      ref('kin/call/Overloads.java', 'Overloads.Store.find(Integer)'),
      ref('kin/call/Overloads.java', 'Overloads.Store.find(String)'),
      ref('kin/call/Overloads.java', 'Overloads.TextHandler.handle'),
      ref('kin/call/Overloads.java', 'Overloads.Visitor.visit(Point)'),
      ref('kin/call/Overloads.java', 'Overloads.Visitor.visit(Pool)'),
      ref('kin/call/Overloads.java', 'Overloads.notEmpty(T,String)'),
      ref('kin/call/Overloads.java', 'Overloads.notEmpty(T,String)~2'),
      ref('kin/call/Overloads.java', 'Overloads.notEmpty(T,String)~3'),
      ref('kin/call/Users.java', 'Users.handle'),
      ref('kin/call/Users.java', 'Users.leaked'),
      ref('kin/call/Users.java', 'Users.lookup'),
      ref('kin/call/Users.java', 'Users.pooled'),
      ref('kin/call/Users.java', 'Users.print'),
    ]);
  });

  it.each(TYPES_0)('lists the project types a type extends or implements: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(TYPES_1)('describes the overload fixtures: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('declares the hierarchy members: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)('declares the overloads: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_2)(
    'numbers generic overloads whose written types are the same: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_3)(
    'closes an inherited close and picks an override only over its supertype: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );
});
