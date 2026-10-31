import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFiles, factsOfFixture } from '../test-support/project.mjs';

let facts;

beforeAll(() => {
  facts = factsOfFixture('flow');
});

describe('the calls of a fixture project', () => {
  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it.each([
    ['src/calls/consumer.ts#reExported', [{ target: 'src/calls/forwards.ts#target', line: 8 }]],
    ['src/calls/consumer.ts#namespaced', [{ target: 'src/calls/forwards.ts#target', line: 12 }]],
    [
      'src/calls/consumer.ts#namespacedReExport',
      [{ target: 'src/calls/forwards.ts#target', line: 16 }],
    ],
    ['src/calls/consumer.ts#aliased', [{ target: 'src/calls/forwards.ts#target', line: 20 }]],
    [
      'src/calls/consumer.ts#overloads',
      [
        { target: 'src/calls/overloads.ts#overloaded', line: 24 },
        { target: 'src/calls/overloads.ts#overloaded', line: 24 },
      ],
    ],
    [
      'src/state/lifecycle.ts#guarded',
      [
        { target: 'src/model/cart.ts#Session.open', line: 4, receiver: 'session' },
        { target: 'src/model/cart.ts#Session.write', line: 6, receiver: 'session' },
        { target: 'src/model/cart.ts#Session.commit', line: 8, receiver: 'session', cleanup: true },
      ],
    ],
    [
      'src/state/lifecycle.ts#leaky',
      [
        { target: 'src/model/cart.ts#Session.open', line: 13, receiver: 'session' },
        { target: 'src/model/cart.ts#Session.write', line: 14, receiver: 'session' },
      ],
    ],
    [
      'src/state/lifecycle.ts#twoSessions',
      [
        { target: 'src/model/cart.ts#Session.open', line: 18, receiver: 'first' },
        { target: 'src/model/cart.ts#Session.open', line: 19, receiver: 'second' },
        { target: 'src/model/cart.ts#Session.commit', line: 20, receiver: 'first' },
      ],
    ],
    [
      'src/state/lifecycle.ts#Worker.run',
      [
        { target: 'src/model/cart.ts#Session.open', line: 27, receiver: 'this.session' },
        { target: 'src/state/lifecycle.ts#Worker.helper', line: 28, receiver: 'this' },
        { target: 'src/model/cart.ts#Session.commit', line: 29, receiver: 'this.session' },
      ],
    ],
    [
      'src/state/mutations.ts#direct',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 4, receiver: 'cart', mutation: 'push' }],
    ],
    [
      'src/state/mutations.ts#aliased',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 8, receiver: 'cart', mutation: 'push' }],
    ],
    [
      'src/state/mutations.ts#aliasedAssign',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 13, receiver: 'cart', mutation: 'assign' }],
    ],
    [
      'src/state/mutations.ts#property',
      [
        {
          target: 'src/model/cart.ts#Cart.settings',
          line: 18,
          receiver: 'cart',
          mutation: 'assign',
        },
      ],
    ],
    [
      'src/state/mutations.ts#reassigned',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 22, receiver: 'cart' }],
    ],
    [
      'src/state/mutations.ts#copied',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 28, receiver: 'cart' }],
    ],
    [
      'src/state/mutations.ts#sliced',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 33, receiver: 'cart' }],
    ],
    [
      'src/state/mutations.ts#readOnly',
      [{ target: 'src/model/cart.ts#Cart.lines', line: 38, receiver: 'cart' }],
    ],
    [
      'src/calls/receivers.ts#Factory.make',
      [{ target: 'src/calls/receivers.ts#Factory.build(static)', line: 21 }],
    ],
    [
      'src/calls/receivers.ts#byInterface',
      [{ target: 'src/calls/receivers.ts#Runner.run', line: 35, receiver: 'runner' }],
    ],
    ['src/state/uses.ts#reads', [{ target: 'src/state/uses.ts#Clock.now', line: 22 }]],
    [
      'src/calls/receivers.ts#byType',
      [
        { target: 'src/calls/receivers.ts#Left.run', line: 26, receiver: 'left' },
        { target: 'src/calls/receivers.ts#Right.run', line: 27, receiver: 'right' },
      ],
    ],
    [
      'src/calls/receivers.ts#shadowed',
      [
        { target: 'src/model/cart.ts#Cart.add', line: 40, receiver: 'cart' },
        { target: 'src/model/cart.ts#Cart.add', line: 42, receiver: 'cart#2' },
      ],
    ],
    [
      'src/calls/receivers.ts#Holder.direct',
      [{ target: 'src/calls/receivers.ts#Left.run', line: 49, receiver: 'this.left' }],
    ],
    [
      'src/calls/receivers.ts#Holder.nested',
      [{ target: 'src/calls/receivers.ts#Left.run', line: 58, receiver: 'this.left' }],
    ],
  ])('lists the resolved calls of %s', (id, expected) => {
    expect(byId(facts.callables, id).calls).toEqual(expected);
  });

  it('leaves out the calls of functions that call nothing the project declares', () => {
    expect(facts.callables.filter(({ calls }) => calls === undefined).map(({ id }) => id)).toEqual([
      'src/calls/forwards.ts#target',
      'src/calls/forwards.ts#side',
      'src/calls/forwards.ts#load',
      'src/calls/forwards.ts#Wrapper.constructor',
      'src/calls/overloads.ts#overloaded',
      'src/calls/receivers.ts#Left.run',
      'src/calls/receivers.ts#Right.run',
      'src/calls/receivers.ts#Runner.run',
      'src/calls/receivers.ts#Factory.build(static)',
      'src/calls/receivers.ts#byUnion',
      'src/calls/receivers.ts#Holder.constructor',
      'src/model/cart.ts#Cart.add',
      'src/model/cart.ts#Cart.lines',
      'src/model/cart.ts#Cart.snapshot',
      'src/model/cart.ts#Cart.mixed',
      'src/model/cart.ts#Cart.settings',
      'src/model/cart.ts#Cart.ready',
      'src/model/cart.ts#Session.open',
      'src/model/cart.ts#Session.write',
      'src/model/cart.ts#Session.commit',
      'src/model/cart.ts#Session.rollback',
      'src/state/lifecycle.ts#Worker.constructor',
      'src/state/lifecycle.ts#Worker.helper',
      'src/state/uses.ts#Clock.now',
      'src/state/uses.ts#extra',
      'src/state/uses.ts#destructures',
      'src/state/uses.ts#destructuresRest',
      'src/state/uses.ts#destructuresParameter',
      'src/state/uses.ts#returns',
      'src/state/uses.ts#stores',
      'src/state/uses.ts#spreads',
      'src/state/uses.ts#captures',
      'src/state/uses.ts#computed',
      'src/state/uses.ts#external',
      'src/state/uses.ts#untouched',
    ]);
  });

  it.each([
    ['src/calls/forwards.ts#target', undefined],
    ['src/calls/forwards.ts#side', undefined],
    ['src/calls/forwards.ts#load', undefined],
    [
      'src/calls/forwards.ts#pure',
      { target: 'src/calls/forwards.ts#target', arguments: [0, 1], returned: true },
    ],
    [
      'src/calls/forwards.ts#partial',
      { target: 'src/calls/forwards.ts#target', arguments: [0, -1], returned: true },
    ],
    [
      'src/calls/forwards.ts#reordered',
      { target: 'src/calls/forwards.ts#target', arguments: [1, 0], returned: true },
    ],
    [
      'src/calls/forwards.ts#statement',
      { target: 'src/calls/forwards.ts#side', arguments: [0], returned: false },
    ],
    ['src/calls/forwards.ts#logged', undefined],
    ['src/calls/forwards.ts#changed', undefined],
    ['src/calls/forwards.ts#spreads', undefined],
    [
      'src/calls/forwards.ts#viaMethod',
      { target: 'src/model/cart.ts#Cart.add', arguments: [1], returned: false },
    ],
    [
      'src/calls/forwards.ts#viaAsync',
      { target: 'src/calls/forwards.ts#load', arguments: [0], returned: true },
    ],
    ['src/calls/forwards.ts#awaited', undefined],
    ['src/calls/forwards.ts#constant', undefined],
    ['src/calls/forwards.ts#Wrapper.constructor', undefined],
    [
      'src/calls/forwards.ts#Wrapper.add',
      { target: 'src/model/cart.ts#Cart.add', arguments: [0], returned: false },
    ],
    ['src/state/uses.ts#extra', undefined],
    [
      'src/state/uses.ts#passes',
      { target: 'src/state/uses.ts#reads', arguments: [0], returned: true },
    ],
    ['src/state/uses.ts#undeclaredPosition', undefined],
  ])('describes the forwarding of %s', (id, expected) => {
    expect(byId(facts.callables, id).forward).toEqual(expected);
  });
});

describe('the callables a fixture project uses as values', () => {
  let referenced;

  beforeAll(() => {
    referenced = factsOfFixture('references');
  });

  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(referenced)).not.toThrow();
  });

  it.each([
    ['src/table.ts#speak', ['src/helpers.ts#shout', 'src/helpers.ts#whisper']],
    ['src/table.ts#check', ['src/helpers.ts#isText', 'src/helpers.ts#isCount']],
    ['src/table.ts#filtered', ['src/helpers.ts#isText']],
    ['src/table.ts#chooser', ['src/helpers.ts#shout']],
    ['src/table.ts#bound', ['src/helpers.ts#whisper']],
    ['src/table.ts#compared', undefined],
    ['src/table.ts#called', undefined],
    ['src/table.ts#recursive', undefined],
    ['src/table.ts#Handler.register', ['src/table.ts#Handler.handle']],
  ])('lists the callables %s uses as values', (id, expected) => {
    expect(byId(referenced.callables, id).references).toEqual(expected);
  });

  it('lists what module-level code calls or uses as values on the module type', () => {
    expect(
      referenced.types
        .filter(({ references }) => references !== undefined)
        .map(({ id, references }) => ({ id, references })),
    ).toEqual([
      {
        id: 'src/registry.ts',
        references: ['src/helpers.ts#addHandler', 'src/helpers.ts#whisper', 'src/helpers.ts#shout'],
      },
      {
        id: 'src/table.ts',
        references: [
          'src/helpers.ts#optional',
          'src/helpers.ts#isText',
          'src/helpers.ts#isCount',
          'src/helpers.ts#shout',
          'src/helpers.ts#whisper',
        ],
      },
    ]);
  });
});

describe('the reads of an accessor', () => {
  const files = {
    'src/cart.ts': [
      'export class Cart {',
      '  private store: string[] = [];',
      '  get items(): string[] { return this.store; }',
      '  set items(value: string[]) { this.store = value; }',
      '  size(): number { return this.items.length; }',
      '}',
      '',
    ].join('\n'),
    'src/use.ts': [
      "import { Cart } from './cart';",
      "export function pushes(cart: Cart) { cart.items.push('x'); }",
      'export function reads(cart: Cart) { return cart.items.length; }',
      "export function aliases(cart: Cart) { const xs = cart.items; xs.push('y'); }",
      'export function replaces(cart: Cart) { cart.items = []; }',
      'export function assigns(cart: Cart) { cart.items.length = 0; }',
      '',
    ].join('\n'),
  };

  it.each([
    ['pushes', [{ target: 'src/cart.ts#Cart.items', line: 2, receiver: 'cart', mutation: 'push' }]],
    ['reads', [{ target: 'src/cart.ts#Cart.items', line: 3, receiver: 'cart' }]],
    [
      'aliases',
      [{ target: 'src/cart.ts#Cart.items', line: 4, receiver: 'cart', mutation: 'push' }],
    ],
    ['replaces', undefined],
    [
      'assigns',
      [{ target: 'src/cart.ts#Cart.items', line: 6, receiver: 'cart', mutation: 'assign' }],
    ],
  ])('records the calls of %s as reads of the accessor', (name, expected) => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, `src/use.ts#${name}`).calls).toEqual(expected);
  });

  it('records a read of the accessor through this', () => {
    const facts = factsOfFiles(files);

    expect(byId(facts.callables, 'src/cart.ts#Cart.size').calls).toEqual([
      { target: 'src/cart.ts#Cart.items', line: 5, receiver: 'this' },
    ]);
  });
});

describe('the cleanup calls of a function', () => {
  const files = {
    'src/conn.ts': 'export class Conn {\n  commit(): void {}\n}\n',
    'src/use.ts': [
      "import { Conn } from './conn';",
      'export function direct(conn: Conn) { try { void 1; } finally { conn.commit(); } }',
      'export function nested(conn: Conn) {',
      '  try { void 1; } finally { [1].forEach(() => conn.commit()); }',
      '}',
      'export function inner(conn: Conn) {',
      '  [1].forEach(() => { try { void 1; } finally { conn.commit(); } });',
      '}',
      '',
    ].join('\n'),
  };

  it.each([
    ['direct', true],
    ['nested', undefined],
    ['inner', true],
  ])(
    'marks the commit in %s as cleanup only when its own function has the finally',
    (name, cleanup) => {
      const facts = factsOfFiles(files);

      expect(byId(facts.callables, `src/use.ts#${name}`).calls?.[0].cleanup).toBe(cleanup);
    },
  );
});
