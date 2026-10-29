import { beforeAll, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { byId, factsOfFixture } from '../test-support/project.mjs';

let facts;

beforeAll(() => {
  facts = factsOfFixture('flow');
});

describe('the member uses of a fixture project', () => {
  it('produces facts that pass the schema', () => {
    expect(() => validateFacts(facts)).not.toThrow();
  });

  it.each([
    ['src/calls/forwards.ts#viaMethod', [{ param: 0, fields: ['add'], forwards: [] }]],
    [
      'src/calls/forwards.ts#Wrapper.constructor',
      [{ param: 0, fields: [], forwards: [], opaque: true }],
    ],
    [
      'src/state/lifecycle.ts#guarded',
      [{ param: 0, fields: ['open', 'write', 'commit'], forwards: [] }],
    ],
    ['src/state/lifecycle.ts#leaky', [{ param: 0, fields: ['open', 'write'], forwards: [] }]],
    [
      'src/state/lifecycle.ts#twoSessions',
      [
        { param: 0, fields: ['open', 'commit'], forwards: [] },
        { param: 1, fields: ['open'], forwards: [] },
      ],
    ],
    [
      'src/state/lifecycle.ts#Worker.constructor',
      [{ param: 0, fields: [], forwards: [], opaque: true }],
    ],
    ['src/state/uses.ts#reads', [{ param: 0, fields: ['clock'], forwards: [] }]],
    ['src/state/uses.ts#destructures', [{ param: 0, fields: ['db', 'name'], forwards: [] }]],
    [
      'src/state/uses.ts#destructuresRest',
      [{ param: 0, fields: ['db'], forwards: [], opaque: true }],
    ],
    [
      'src/state/uses.ts#destructuresParameter',
      [{ param: 0, fields: ['db', 'name'], forwards: [] }],
    ],
    [
      'src/state/uses.ts#passes',
      [{ param: 0, fields: [], forwards: [{ target: 'src/state/uses.ts#reads', position: 0 }] }],
    ],
    ['src/state/uses.ts#returns', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/state/uses.ts#stores', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/state/uses.ts#spreads', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/state/uses.ts#captures', [{ param: 0, fields: ['db'], forwards: [], opaque: true }]],
    ['src/state/uses.ts#computed', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/state/uses.ts#external', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    [
      'src/state/uses.ts#undeclaredPosition',
      [{ param: 0, fields: [], forwards: [], opaque: true }],
    ],
    ['src/state/uses.ts#untouched', [{ param: 0, fields: ['locale'], forwards: [] }]],
  ])('lists how %s uses its parameters', (id, expected) => {
    expect(byId(facts.callables, id).paramUses).toEqual(expected);
  });

  it.each([
    ['src/model/cart.ts#Cart.add', ['items']],
    ['src/model/cart.ts#Cart.lines', ['items']],
    ['src/model/cart.ts#Cart.snapshot', ['items']],
    ['src/model/cart.ts#Cart.mixed', ['items']],
    ['src/model/cart.ts#Cart.settings', ['config']],
    ['src/model/cart.ts#Cart.ready', ['items']],
    ['src/calls/forwards.ts#Wrapper.add', ['cart']],
    ['src/state/lifecycle.ts#Worker.run', ['session']],
    ['src/calls/receivers.ts#Holder.direct', ['left']],
    ['src/calls/receivers.ts#Holder.nested', ['left']],
  ])('lists the own fields %s touches', (id, expected) => {
    expect(byId(facts.callables, id).ownFields).toEqual(expected);
  });

  it('names the field a callable returns itself', () => {
    expect(
      facts.callables
        .filter(({ returnsField }) => returnsField !== undefined)
        .map(({ id, returnsField }) => ({ id, returnsField })),
    ).toEqual([
      { id: 'src/model/cart.ts#Cart.lines', returnsField: 'items' },
      { id: 'src/model/cart.ts#Cart.mixed', returnsField: 'items' },
      { id: 'src/model/cart.ts#Cart.settings', returnsField: 'config' },
    ]);
  });

  it.each([
    ['src/state/uses.ts#reads', [{ type: 'src/state/uses.ts#Ctx', fields: ['clock'], line: 22 }]],
    ['src/state/uses.ts#captures', [{ type: 'src/state/uses.ts#Ctx', fields: ['db'], line: 56 }]],
    [
      'src/state/uses.ts#untouched',
      [{ type: 'src/state/uses.ts#Ctx', fields: ['locale'], line: 72 }],
    ],
  ])('lists the values %s reads from', (id, expected) => {
    expect(byId(facts.callables, id).reads).toEqual(expected);
  });
});
