import { describe, expect, it } from 'vitest';
import { goFacts } from '../go-facts.mjs';
import { MODULE, fn, goReport, owner } from './support.mjs';

const cart = owner('orders/cart.go', 'Cart');
const pay = owner('checkout/pay.go');
const payFunction = fn(pay, 'Pay');
const lines = fn(cart, 'Lines');

describe('Go design facts', () => {
  it('passes the inspector types and callables on as shared facts', () => {
    const facts = goFacts(goReport({ types: [cart, pay], callables: [lines, payFunction] }), {
      module: MODULE,
    });
    expect(facts.types.map(({ id }) => id)).toEqual([cart.id, pay.id]);
    expect(facts.callables.map(({ id }) => id)).toEqual([lines.id, payFunction.id]);
  });

  it('leaves the lists empty when the report has no design section', () => {
    const facts = goFacts({ files: [], definitions: [], usages: [] }, { module: 'shop' });
    expect([facts.types, facts.callables]).toEqual([[], []]);
  });

  it('marks exported declarations of an importable package as published', () => {
    const input = goReport({
      types: [cart, pay, { ...owner('checkout/hidden.go', 'hidden'), exported: false }],
      callables: [lines, payFunction, { ...fn(pay, 'helper'), exported: false }],
    });
    const facts = goFacts(input, { module: MODULE });
    expect(facts.types.map(({ published }) => published)).toEqual([true, true, undefined]);
    expect(facts.callables.map(({ published }) => published)).toEqual([undefined, true, undefined]);
    const internal = goFacts(input, { module: 'shop' });
    expect(internal.types.map(({ published }) => published)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
