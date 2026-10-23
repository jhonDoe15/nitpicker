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
    line: 9,
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
    file: 'route/Router.java',
    owner: 'Router',
    member: '<init>',
    line: 16,
    name: 'Router',
    kind: 'constructor',
    params: [{ name: 'prefix', type: 'String' }],
    ownFields: ['prefix'],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'describe',
    line: 46,
    kind: 'accessor',
    returns: 'String',
    ownFields: ['prefix'],
    returnsField: 'prefix',
  }),
];
const CALLABLES_1 = [
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'route',
    line: 20,
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
    line: 24,
    returns: 'Consumer',
    references: [ref('route/Handlers.java', 'Handlers.onA')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'bound',
    line: 28,
    params: [{ name: 'handlers', type: ref('route/Handlers.java', 'Handlers') }],
    returns: 'Consumer',
    paramUses: [{ param: 0, fields: [], forwards: [], opaque: true }],
    references: [ref('route/Handlers.java', 'Handlers.instance')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'factory',
    line: 32,
    returns: 'Function',
    references: [ref('route/Router.java', 'Router.<init>')],
  }),
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'own',
    line: 36,
    returns: 'Supplier',
    references: [ref('route/Router.java', 'Router.describe')],
  }),
];
const CALLABLES_2 = [
  callable({
    file: 'route/Router.java',
    owner: 'Router',
    member: 'leftOut',
    line: 40,
    returns: 'Object',
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
      ref('route/Router.java', 'Router.<init>'),
      ref('route/Router.java', 'Router.bound'),
      ref('route/Router.java', 'Router.callback'),
      ref('route/Router.java', 'Router.describe'),
      ref('route/Router.java', 'Router.factory'),
      ref('route/Router.java', 'Router.leftOut'),
      ref('route/Router.java', 'Router.own'),
      ref('route/Router.java', 'Router.route'),
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

  it.each(CALLABLES_2)(
    'leaves out an overloaded or a library method reference: $id',
    (expected) => {
      expect(facts.callables.find(({ id }) => id === expected.id)).toEqual(expected);
    },
  );
});
