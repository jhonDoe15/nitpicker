import { describe, expect, it } from 'vitest';
import { goFactFindings } from './go-fact-findings.mjs';
import { goFacts } from './go-facts.mjs';

function file(path, extra = {}) {
  return {
    path,
    package: path.split('/').at(-2) ?? 'root',
    test: false,
    generated: false,
    constrained: false,
    ...extra,
  };
}

const CART = 'orders/cart.go';
const PAY = 'checkout/pay.go';
const CART_TYPE = `${CART}#Cart`;
const LINES = `${CART}#Cart.Lines`;

function cart(extra = {}) {
  return {
    id: CART_TYPE,
    file: CART,
    name: 'Cart',
    line: 3,
    kind: 'class',
    exported: true,
    fields: [{ name: 'items', mutable: true, private: true }],
    ...extra,
  };
}

const LINES_MEMBER = {
  id: LINES,
  file: CART,
  name: 'Lines',
  line: 7,
  kind: 'method',
  exported: true,
  owner: CART_TYPE,
  returns: '[]string',
  returnsField: 'items',
};

function pay(calls) {
  return {
    id: `${PAY}#Pay`,
    file: PAY,
    name: 'Pay',
    line: 5,
    kind: 'function',
    exported: true,
    owner: PAY,
    params: [{ name: 'cart', type: CART_TYPE }],
    calls,
  };
}

const PAY_MODULE = {
  id: PAY,
  file: PAY,
  name: 'pay',
  line: 1,
  kind: 'module',
  exported: true,
};

function report(callables, { types = [cart(), PAY_MODULE] } = {}) {
  return {
    files: [file(CART), file(PAY)],
    definitions: [],
    usages: [],
    design: { types, callables: [LINES_MEMBER, ...callables] },
  };
}

function rows(input, module = 'example.com/shop') {
  return goFactFindings(goFacts(input, { module })).map(({ rule, path, location }) => [
    rule,
    path,
    location?.line,
  ]);
}

describe('Go design facts', () => {
  it('passes the inspector types and callables on as shared facts', () => {
    const facts = goFacts(report([pay([])]), { module: 'example.com/shop' });
    expect(facts.types.map(({ id }) => id)).toEqual([CART_TYPE, PAY]);
    expect(facts.callables.map(({ id }) => id)).toEqual([LINES, `${PAY}#Pay`]);
  });

  it('leaves the lists empty when the report has no design section', () => {
    const facts = goFacts({ files: [], definitions: [], usages: [] }, { module: 'shop' });
    expect([facts.types, facts.callables]).toEqual([[], []]);
  });

  it('marks exported declarations of an importable package as published', () => {
    const facts = goFacts(report([pay([])]), { module: 'example.com/shop' });
    expect(facts.types.map(({ published }) => published)).toEqual([true, true]);
    expect(facts.callables.map(({ published }) => published)).toEqual([undefined, true]);
    const internal = goFacts(report([pay([])]), { module: 'shop' });
    expect(internal.types.map(({ published }) => published)).toEqual([undefined, undefined]);
  });

  it('fails a caller that changes the private list a member returned', () => {
    const calls = [{ target: LINES, line: 6, mutation: 'assign' }];
    expect(rows(report([pay(calls)]))).toEqual([['mutable-state-escape', PAY, 6]]);
  });

  it.each([
    ['a read', [{ target: LINES, line: 6 }], {}],
    [
      'a field other packages can reach',
      [{ target: LINES, line: 6, mutation: 'assign' }],
      {
        types: [cart({ fields: [{ name: 'items', mutable: true }] }), PAY_MODULE],
      },
    ],
    [
      'a field that is not a reference',
      [{ target: LINES, line: 6, mutation: 'assign' }],
      {
        types: [cart({ fields: [{ name: 'items', private: true }] }), PAY_MODULE],
      },
    ],
  ])('passes %s', (_, calls, options) => {
    expect(rows(report([pay(calls)], options))).toEqual([]);
  });
});
