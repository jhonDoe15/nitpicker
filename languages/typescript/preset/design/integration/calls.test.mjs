import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFixture } from '../test-support/project.mjs';

let facts;

beforeAll(() => {
  facts = factsOfFixture('flow');
});

describe('the calls of a fixture project', () => {
  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it.each([
    ['src/consumer.ts#reExported', [{ target: 'src/forwards.ts#target', line: 8 }]],
    ['src/consumer.ts#namespaced', [{ target: 'src/forwards.ts#target', line: 12 }]],
    ['src/consumer.ts#namespacedReExport', [{ target: 'src/forwards.ts#target', line: 16 }]],
    ['src/consumer.ts#aliased', [{ target: 'src/forwards.ts#target', line: 20 }]],
    [
      'src/consumer.ts#overloads',
      [
        { target: 'src/overloads.ts#overloaded', line: 24 },
        { target: 'src/overloads.ts#overloaded', line: 24 },
      ],
    ],
    [
      'src/lifecycle.ts#guarded',
      [
        { target: 'src/cart.ts#Session.open', line: 4, receiver: 'session' },
        { target: 'src/cart.ts#Session.write', line: 6, receiver: 'session' },
        { target: 'src/cart.ts#Session.commit', line: 8, receiver: 'session', cleanup: true },
      ],
    ],
    [
      'src/lifecycle.ts#leaky',
      [
        { target: 'src/cart.ts#Session.open', line: 13, receiver: 'session' },
        { target: 'src/cart.ts#Session.write', line: 14, receiver: 'session' },
      ],
    ],
    [
      'src/lifecycle.ts#twoSessions',
      [
        { target: 'src/cart.ts#Session.open', line: 18, receiver: 'first' },
        { target: 'src/cart.ts#Session.open', line: 19, receiver: 'second' },
        { target: 'src/cart.ts#Session.commit', line: 20, receiver: 'first' },
      ],
    ],
    [
      'src/lifecycle.ts#Worker.run',
      [
        { target: 'src/cart.ts#Session.open', line: 27, receiver: 'this.session' },
        { target: 'src/lifecycle.ts#Worker.helper', line: 28, receiver: 'this' },
        { target: 'src/cart.ts#Session.commit', line: 29, receiver: 'this.session' },
      ],
    ],
    [
      'src/mutations.ts#direct',
      [{ target: 'src/cart.ts#Cart.lines', line: 4, receiver: 'cart', mutation: 'push' }],
    ],
    [
      'src/mutations.ts#aliased',
      [{ target: 'src/cart.ts#Cart.lines', line: 8, receiver: 'cart', mutation: 'push' }],
    ],
    [
      'src/mutations.ts#aliasedAssign',
      [{ target: 'src/cart.ts#Cart.lines', line: 13, receiver: 'cart', mutation: 'assign' }],
    ],
    [
      'src/mutations.ts#property',
      [{ target: 'src/cart.ts#Cart.settings', line: 18, receiver: 'cart', mutation: 'assign' }],
    ],
    [
      'src/mutations.ts#reassigned',
      [{ target: 'src/cart.ts#Cart.lines', line: 22, receiver: 'cart' }],
    ],
    ['src/mutations.ts#copied', [{ target: 'src/cart.ts#Cart.lines', line: 28, receiver: 'cart' }]],
    ['src/mutations.ts#sliced', [{ target: 'src/cart.ts#Cart.lines', line: 33, receiver: 'cart' }]],
    [
      'src/mutations.ts#readOnly',
      [{ target: 'src/cart.ts#Cart.lines', line: 38, receiver: 'cart' }],
    ],
    ['src/receivers.ts#Factory.make', [{ target: 'src/receivers.ts#Factory.build', line: 21 }]],
    [
      'src/receivers.ts#byType',
      [
        { target: 'src/receivers.ts#Left.run', line: 26, receiver: 'left' },
        { target: 'src/receivers.ts#Right.run', line: 27, receiver: 'right' },
      ],
    ],
    [
      'src/receivers.ts#shadowed',
      [
        { target: 'src/cart.ts#Cart.add', line: 40, receiver: 'cart' },
        { target: 'src/cart.ts#Cart.add', line: 42, receiver: 'cart#2' },
      ],
    ],
    [
      'src/receivers.ts#Holder.direct',
      [{ target: 'src/receivers.ts#Left.run', line: 49, receiver: 'this.left' }],
    ],
    [
      'src/receivers.ts#Holder.nested',
      [{ target: 'src/receivers.ts#Left.run', line: 58, receiver: 'this.left' }],
    ],
  ])('lists the resolved calls of %s', (id, expected) => {
    expect(byId(facts.callables, id).calls).toEqual(expected);
  });

  it('leaves out the calls of functions that call nothing the project declares', () => {
    expect(facts.callables.filter(({ calls }) => calls === undefined).map(({ id }) => id)).toEqual([
      'src/cart.ts#Cart.add',
      'src/cart.ts#Cart.lines',
      'src/cart.ts#Cart.snapshot',
      'src/cart.ts#Cart.mixed',
      'src/cart.ts#Cart.settings',
      'src/cart.ts#Cart.ready',
      'src/cart.ts#Session.open',
      'src/cart.ts#Session.write',
      'src/cart.ts#Session.commit',
      'src/cart.ts#Session.rollback',
      'src/forwards.ts#target',
      'src/forwards.ts#side',
      'src/forwards.ts#load',
      'src/forwards.ts#Wrapper.constructor',
      'src/lifecycle.ts#Worker.constructor',
      'src/lifecycle.ts#Worker.helper',
      'src/overloads.ts#overloaded',
      'src/receivers.ts#Left.run',
      'src/receivers.ts#Right.run',
      'src/receivers.ts#Factory.build',
      'src/receivers.ts#byUnion',
      'src/receivers.ts#byInterface',
      'src/receivers.ts#Holder.constructor',
      'src/uses.ts#extra',
      'src/uses.ts#reads',
      'src/uses.ts#destructures',
      'src/uses.ts#destructuresRest',
      'src/uses.ts#destructuresParameter',
      'src/uses.ts#returns',
      'src/uses.ts#stores',
      'src/uses.ts#spreads',
      'src/uses.ts#captures',
      'src/uses.ts#computed',
      'src/uses.ts#external',
      'src/uses.ts#untouched',
    ]);
  });

  it.each([
    ['src/forwards.ts#target', undefined],
    ['src/forwards.ts#side', undefined],
    ['src/forwards.ts#load', undefined],
    [
      'src/forwards.ts#pure',
      { target: 'src/forwards.ts#target', arguments: [0, 1], returned: true },
    ],
    [
      'src/forwards.ts#partial',
      { target: 'src/forwards.ts#target', arguments: [0, -1], returned: true },
    ],
    [
      'src/forwards.ts#reordered',
      { target: 'src/forwards.ts#target', arguments: [1, 0], returned: true },
    ],
    [
      'src/forwards.ts#statement',
      { target: 'src/forwards.ts#side', arguments: [0], returned: false },
    ],
    ['src/forwards.ts#logged', undefined],
    ['src/forwards.ts#changed', undefined],
    ['src/forwards.ts#spreads', undefined],
    [
      'src/forwards.ts#viaMethod',
      { target: 'src/cart.ts#Cart.add', arguments: [1], returned: false },
    ],
    [
      'src/forwards.ts#viaAsync',
      { target: 'src/forwards.ts#load', arguments: [0], returned: true },
    ],
    ['src/forwards.ts#awaited', undefined],
    ['src/forwards.ts#constant', undefined],
    ['src/forwards.ts#Wrapper.constructor', undefined],
    [
      'src/forwards.ts#Wrapper.add',
      { target: 'src/cart.ts#Cart.add', arguments: [0], returned: false },
    ],
    ['src/uses.ts#extra', undefined],
    ['src/uses.ts#passes', { target: 'src/uses.ts#reads', arguments: [0], returned: true }],
    ['src/uses.ts#undeclaredPosition', undefined],
  ])('describes the forwarding of %s', (id, expected) => {
    expect(byId(facts.callables, id).forward).toEqual(expected);
  });
});
