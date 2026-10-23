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
    ['src/forwards.ts#viaMethod', [{ param: 0, fields: ['add'], forwards: [] }]],
    ['src/forwards.ts#Wrapper.constructor', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/lifecycle.ts#guarded', [{ param: 0, fields: ['open', 'write', 'commit'], forwards: [] }]],
    ['src/lifecycle.ts#leaky', [{ param: 0, fields: ['open', 'write'], forwards: [] }]],
    [
      'src/lifecycle.ts#twoSessions',
      [
        { param: 0, fields: ['open', 'commit'], forwards: [] },
        { param: 1, fields: ['open'], forwards: [] },
      ],
    ],
    ['src/lifecycle.ts#Worker.constructor', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#reads', [{ param: 0, fields: ['clock'], forwards: [] }]],
    ['src/uses.ts#destructures', [{ param: 0, fields: ['db', 'name'], forwards: [] }]],
    ['src/uses.ts#destructuresRest', [{ param: 0, fields: ['db'], forwards: [], opaque: true }]],
    ['src/uses.ts#destructuresParameter', [{ param: 0, fields: ['db', 'name'], forwards: [] }]],
    [
      'src/uses.ts#passes',
      [{ param: 0, fields: [], forwards: [{ target: 'src/uses.ts#reads', position: 0 }] }],
    ],
    ['src/uses.ts#returns', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#stores', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#spreads', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#captures', [{ param: 0, fields: ['db'], forwards: [], opaque: true }]],
    ['src/uses.ts#computed', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#external', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#undeclaredPosition', [{ param: 0, fields: [], forwards: [], opaque: true }]],
    ['src/uses.ts#untouched', [{ param: 0, fields: ['locale'], forwards: [] }]],
  ])('lists how %s uses its parameters', (id, expected) => {
    expect(byId(facts.callables, id).paramUses).toEqual(expected);
  });

  it.each([
    ['src/cart.ts#Cart.add', ['items']],
    ['src/cart.ts#Cart.lines', ['items']],
    ['src/cart.ts#Cart.snapshot', ['items']],
    ['src/cart.ts#Cart.mixed', ['items']],
    ['src/cart.ts#Cart.settings', ['config']],
    ['src/cart.ts#Cart.ready', ['items']],
    ['src/forwards.ts#Wrapper.add', ['cart']],
    ['src/lifecycle.ts#Worker.run', ['session']],
    ['src/receivers.ts#Holder.direct', ['left']],
    ['src/receivers.ts#Holder.nested', ['left']],
  ])('lists the own fields %s touches', (id, expected) => {
    expect(byId(facts.callables, id).ownFields).toEqual(expected);
  });

  it('names the field a callable returns itself', () => {
    expect(
      facts.callables
        .filter(({ returnsField }) => returnsField !== undefined)
        .map(({ id, returnsField }) => ({ id, returnsField })),
    ).toEqual([
      { id: 'src/cart.ts#Cart.lines', returnsField: 'items' },
      { id: 'src/cart.ts#Cart.mixed', returnsField: 'items' },
      { id: 'src/cart.ts#Cart.settings', returnsField: 'config' },
    ]);
  });

  it.each([
    ['src/uses.ts#reads', [{ type: 'src/uses.ts#Ctx', fields: ['clock'], line: 22 }]],
    ['src/uses.ts#captures', [{ type: 'src/uses.ts#Ctx', fields: ['db'], line: 56 }]],
    ['src/uses.ts#untouched', [{ type: 'src/uses.ts#Ctx', fields: ['locale'], line: 72 }]],
  ])('lists the values %s reads from', (id, expected) => {
    expect(byId(facts.callables, id).reads).toEqual(expected);
  });
});
