import { describe, expect, it } from 'vitest';
import { designFacts, designRun, fn, owner, summaries } from '../test-support/design-facts.mjs';

const cart = owner('src/orders/cart.ts', 'Cart', {
  fields: [
    { name: 'items', mutable: true, private: true },
    { name: 'tags', mutable: true },
    { name: 'total', private: true },
  ],
});
const lines = fn(cart, 'lines', { params: [], returnsField: 'items' });
const tags = fn(cart, 'tags', { params: [], returnsField: 'tags' });
const hidden = fn(cart, 'snapshot', { params: [], returnsField: 'items', exported: false });
const pay = owner('src/checkout/pay.ts');

function payWith(calls) {
  return fn(pay, 'pay', { line: 4, calls });
}

describe('mutable-state-escape', () => {
  it('fails a caller in another module that changes the private list a member returned', () => {
    const facts = designFacts({
      types: [cart, pay],
      callables: [
        lines,
        payWith([{ target: lines.id, line: 5, receiver: 'cart', mutation: 'push' }]),
      ],
    });
    const findings = designRun(facts, 'mutable-state-escape');
    expect(summaries(findings)).toEqual([
      {
        rule: 'mutable-state-escape',
        path: 'src/checkout/pay.ts',
        identity: 'src/checkout/pay.ts#pay>src/orders/cart.ts#Cart.lines:push',
        classification: 'enforceable',
        line: 5,
      },
    ]);
    expect(findings[0].message).toBe(
      'pay changes the private `items` of Cart through the value `Cart.lines` returns (`push`), so Cart no longer controls its own state. Return a copy or a read-only view from `Cart.lines`, or add an operation to Cart that makes this change. If this is intended, add {"rule":"mutable-state-escape","paths":["src/checkout/pay.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['a field other modules can reach', [tags], { target: tags.id, mutation: 'push' }],
    ['a member other modules cannot call', [hidden], { target: hidden.id, mutation: 'push' }],
    ['a call that does not change the value', [lines], { target: lines.id }],
  ])('passes %s', (_, members, call) => {
    const facts = designFacts({
      types: [cart, pay],
      callables: [...members, payWith([{ line: 5, receiver: 'cart', ...call }])],
    });
    expect(designRun(facts, 'mutable-state-escape')).toEqual([]);
  });

  it('passes the owner changing its own state, and an excepted caller', () => {
    const own = fn(cart, 'add', { calls: [{ target: lines.id, line: 3, mutation: 'assign' }] });
    const facts = designFacts({
      types: [cart, pay],
      callables: [lines, own, payWith([{ target: lines.id, line: 5, mutation: 'assign' }])],
    });
    const policy = { exceptions: [{ rule: 'mutable-state-escape', paths: ['src/checkout/**'] }] };
    expect(designRun(facts, 'mutable-state-escape', policy)).toEqual([]);
  });
});

const context = owner('src/app/context.ts', 'AppContext', {
  kind: 'data',
  fields: ['clock', 'rates', 'db', 'mailer', 'logger', 'config'].map((name) => ({ name })),
});
const contextParam = [{ name: 'ctx', type: context.id }];
const billing = owner('src/billing/charge.ts');
const tax = owner('src/billing/tax.ts');
const orders = owner('src/orders/place.ts');

function threaded({
  taxUse = { param: 0, fields: ['rates'], forwards: [] },
  chargeFields = ['clock'],
} = {}) {
  const taxOf = fn(tax, 'taxOf', { params: contextParam, paramUses: [taxUse] });
  const charge = fn(billing, 'charge', {
    params: contextParam,
    paramUses: [{ param: 0, fields: chargeFields, forwards: [{ target: taxOf.id, position: 0 }] }],
  });
  const place = fn(orders, 'place', {
    params: contextParam,
    paramUses: [{ param: 0, fields: [], forwards: [{ target: charge.id, position: 0 }] }],
  });
  return designFacts({ types: [context, billing, tax, orders], callables: [place, charge, taxOf] });
}

describe('context-threading', () => {
  it('reports the head of a chain that passes a broad context and reads two of its fields', () => {
    const findings = designRun(threaded(), 'context-threading');
    expect(summaries(findings)).toEqual([
      {
        rule: 'context-threading',
        path: 'src/orders/place.ts',
        identity: 'src/orders/place.ts#place#ctx',
        classification: 'descriptive',
        line: 2,
      },
    ]);
    expect(findings[0].message).toBe(
      'place takes the whole AppContext (6 fields) as `ctx` and passes it on through charge, taxOf, which together read only `clock` and `rates`. Pass those values, or a small type with just them, so callers need not build a whole AppContext. If this is intended, add {"rule":"context-threading","paths":["src/orders/place.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it.each([
    ['an opaque use', { taxUse: { param: 0, fields: [], forwards: [], opaque: true } }],
    ['a chain that reads three of six fields', { chargeFields: ['clock', 'db'] }],
  ])('passes %s', (_, shape) => {
    expect(designRun(threaded(shape), 'context-threading')).toEqual([]);
  });

  it('passes a head on the public surface of a published package', () => {
    const facts = threaded();
    const types = facts.types.map((type) =>
      type.id === orders.id ? { ...type, published: true } : type,
    );
    expect(designRun({ ...facts, types }, 'context-threading')).toEqual([]);
  });

  it('passes a context with fewer than five fields', () => {
    const facts = threaded();
    const small = { ...context, fields: context.fields.slice(0, 4) };
    expect(
      designRun({ ...facts, types: [small, ...facts.types.slice(1)] }, 'context-threading'),
    ).toEqual([]);
  });
});
