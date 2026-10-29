import { describe, expect, it } from 'vitest';
import { callable, fixtureFacts, ref, type } from '../../test-support/design-facts-support.mjs';

const facts = fixtureFacts('references');

const MODULES = [
  { file: 'src/main/java/route/Handlers.java', role: 'production' },
  { file: 'src/main/java/route/Router.java', role: 'production' },
];
const TYPES_0 = [
  type({ file: 'route/Handlers.java', symbol: 'Handlers', line: 3, kind: 'class' }),
  type({
    file: 'route/Router.java',
    symbol: 'Router',
    line: 10,
    kind: 'class',
    fields: [{ name: 'prefix', private: true }],
  }),
];
const CALLABLES_0 = [
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'onA',
    line: 4,
    params: [{ name: 'text', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'onB',
    line: 8,
    params: [{ name: 'text', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'over(int)',
    line: 12,
    name: 'over',
    params: [{ name: 'value', type: 'int' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'over(String)',
    line: 16,
    name: 'over',
    params: [{ name: 'value', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'instance',
    line: 20,
    params: [{ name: 'text', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'pick(String)',
    line: 24,
    name: 'pick',
    params: [{ name: 'text', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'pick(String,int)',
    line: 28,
    name: 'pick',
    params: [
      { name: 'text', type: 'String' },
      { name: 'times', type: 'int' },
    ],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'ping()',
    line: 32,
    name: 'ping',
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'ping(String)',
    line: 36,
    name: 'ping',
    params: [{ name: 'text', type: 'String' }],
    returns: 'void',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'size()',
    line: 40,
    name: 'size',
    returns: 'int',
  }),
  callable({
    file: 'route/Handlers.java',
    owner: 'Handlers',
    member: 'size(int,int)',
    line: 44,
    name: 'size',
    params: [
      { name: 'width', type: 'int' },
      { name: 'height', type: 'int' },
    ],
    returns: 'int',
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: '<init>',
    line: 17,
    name: 'Router',
    kind: 'constructor',
    params: [{ name: 'prefix', type: 'String' }],
    ownFields: ['prefix'],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'describe',
    line: 47,
    kind: 'accessor',
    returns: 'String',
    ownFields: ['prefix'],
    returnsField: 'prefix',
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'register',
    line: 59,
    params: [{ name: 'action', type: 'Runnable' }],
    returns: 'void',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'route',
    line: 21,
    params: [{ name: 'key', type: 'String' }],
    returns: 'void',
    ownFields: ['prefix'],
    references: [
      ref('route/Handlers.java', 'Handlers.onA'),
      ref('route/Handlers.java', 'Handlers.onB'),
    ],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'callback',
    line: 25,
    returns: 'Consumer',
    references: [ref('route/Handlers.java', 'Handlers.onA')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'bound',
    line: 29,
    params: [{ name: 'handlers', type: ref('route/Handlers.java', 'Handlers') }],
    returns: 'Consumer',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    references: [ref('route/Handlers.java', 'Handlers.instance')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'factory',
    line: 33,
    returns: 'Function',
    references: [ref('route/Router.java', 'Router.<init>')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'own',
    line: 37,
    returns: 'Supplier',
    references: [ref('route/Router.java', 'Router.describe')],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'picks',
    line: 51,
    returns: 'Object',
    calls: [{ target: ref('route/Router.java', 'Router.register'), line: 55, receiver: 'this' }],
    references: [
      ref('route/Handlers.java', 'Handlers.pick(String)'),
      ref('route/Handlers.java', 'Handlers.pick(String,int)'),
      ref('route/Handlers.java', 'Handlers.ping()'),
      ref('route/Handlers.java', 'Handlers.size()'),
    ],
  }),
];
const CALLABLES_3 = [
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'leftOut',
    line: 41,
    returns: 'Object',
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'unknown',
    line: 63,
    returns: 'Map',
  }),
];

describe('design facts: callables used as values without a call', () => {
  it('lists every parsed file as a production module', () => {
    expect(facts.modules).toEqual(MODULES);
  });

  it('lists exactly these types and callables', () => {
    expect(facts.types.map(({ id }) => id).toSorted()).toEqual([
      ref('route/Handlers.java', 'Handlers'),
      ref('route/Router.java', 'Router'),
    ]);
    expect(facts.callables.map(({ id }) => id).toSorted()).toEqual([
      ref('route/Handlers.java', 'Handlers.instance'),
      ref('route/Handlers.java', 'Handlers.onA'),
      ref('route/Handlers.java', 'Handlers.onB'),
      ref('route/Handlers.java', 'Handlers.over(String)'),
      ref('route/Handlers.java', 'Handlers.over(int)'),
      ref('route/Handlers.java', 'Handlers.pick(String)'),
      ref('route/Handlers.java', 'Handlers.pick(String,int)'),
      ref('route/Handlers.java', 'Handlers.ping()'),
      ref('route/Handlers.java', 'Handlers.ping(String)'),
      ref('route/Handlers.java', 'Handlers.size()'),
      ref('route/Handlers.java', 'Handlers.size(int,int)'),
      ref('route/Router.java', 'Router.<init>'),
      ref('route/Router.java', 'Router.bound'),
      ref('route/Router.java', 'Router.callback'),
      ref('route/Router.java', 'Router.describe'),
      ref('route/Router.java', 'Router.factory'),
      ref('route/Router.java', 'Router.leftOut'),
      ref('route/Router.java', 'Router.own'),
      ref('route/Router.java', 'Router.picks'),
      ref('route/Router.java', 'Router.register'),
      ref('route/Router.java', 'Router.route'),
      ref('route/Router.java', 'Router.unknown'),
    ]);
  });

  it.each(TYPES_0)('describes the types: $id', (expected) => {
    expect(facts.types.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_0)('declares the referenced methods: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_1)(
    'lists method references and a static table the callable reads: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );

  it.each(CALLABLES_2)('picks the overload whose arity the target type gives: $id', (expected) => {
    expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
  });

  it.each(CALLABLES_3)(
    'leaves out an overload the target type does not decide, and a library method: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );
});
