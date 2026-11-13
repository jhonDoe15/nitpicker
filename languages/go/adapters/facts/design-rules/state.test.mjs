import { describe, expect, it } from 'vitest';
import { MODULE, designRows, fn, owner } from './support.mjs';

const cart = owner('orders/cart.go', 'Cart', {
  fields: [
    { name: 'items', mutable: true, private: true },
    { name: 'Tags', mutable: true },
    { name: 'total', private: true },
  ],
});
const lines = fn(cart, 'Lines', { params: [], returnsField: 'items' });
const tags = fn(cart, 'Tags', { params: [], returnsField: 'Tags' });
const total = fn(cart, 'Total', { params: [], returnsField: 'total' });
const pay = owner('checkout/pay.go');

function payWith(call) {
  return fn(pay, 'Pay', { line: 5, calls: [{ line: 6, ...call }] });
}

function escapes(members, call) {
  return designRows(
    { types: [cart, pay], callables: [...members, payWith(call)] },
    'mutable-state-escape',
  );
}

describe('mutable-state-escape on Go facts', () => {
  it('fails a caller in another file that changes the private slice a method returned', () => {
    expect(escapes([lines], { target: lines.id, mutation: 'assign' })).toEqual([
      {
        path: 'checkout/pay.go',
        identity: 'checkout/pay.go#Pay>orders/cart.go#Cart.Lines:assign',
        classification: 'enforceable',
        line: 6,
      },
    ]);
  });

  it.each([
    ['a read', lines, {}],
    ['an exported field', tags, { mutation: 'delete' }],
    ['a field that is not a reference', total, { mutation: 'assign' }],
    ['an unexported method', { ...lines, exported: false }, { mutation: 'assign' }],
  ])('passes %s', (_, member, extra) => {
    expect(escapes([member], { target: member.id, ...extra })).toEqual([]);
  });

  it('passes a method of the same type in another file of its package', () => {
    const sorted = fn(cart, 'Sorted', {
      file: 'orders/cart_sort.go',
      calls: [{ line: 4, target: lines.id, receiver: 'this', mutation: 'sort' }],
    });

    expect(
      designRows({ types: [cart, pay], callables: [lines, sorted] }, 'mutable-state-escape'),
    ).toEqual([]);
  });
});

const context = owner('app/context.go', 'Context', {
  kind: 'data',
  fields: ['Clock', 'Rates', 'DB', 'Mailer', 'Logger', 'Config'].map((name) => ({ name })),
});
const contextParams = [{ name: 'ctx', type: context.id }];
const orders = owner('orders/place.go');
const billing = owner('billing/charge.go');
const rates = owner('billing/rate.go');

function threaded(rateFields = ['Rates'], module = 'shop') {
  const rate = fn(rates, 'Rate', {
    params: contextParams,
    paramUses: [{ param: 0, fields: rateFields, forwards: [] }],
  });
  const charge = fn(billing, 'Charge', {
    params: contextParams,
    paramUses: [{ param: 0, fields: ['Clock'], forwards: [{ target: rate.id, position: 0 }] }],
  });
  const place = fn(orders, 'Place', {
    params: contextParams,
    paramUses: [{ param: 0, fields: [], forwards: [{ target: charge.id, position: 0 }] }],
  });
  return designRows(
    { types: [context, orders, billing, rates], callables: [place, charge, rate] },
    'context-threading',
    { module },
  );
}

describe('context-threading on Go facts', () => {
  it('reports the head of a chain that reads two of six fields', () => {
    expect(threaded()).toEqual([
      {
        path: 'orders/place.go',
        identity: 'orders/place.go#Place#ctx',
        classification: 'descriptive',
        line: 2,
      },
    ]);
  });

  it('passes a chain that reads three of six fields', () => {
    expect(threaded(['Rates', 'DB'])).toEqual([]);
  });

  it('passes a head in a package other modules can import', () => {
    expect(threaded(['Rates'], MODULE)).toEqual([]);
  });
});
