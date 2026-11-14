import { describe, expect, it } from 'vitest';
import { goFacts } from '../facts/go-facts.mjs';
import { goEntryPointFindings, goReexports } from './go-entry-points.mjs';

const MODULE = 'example.com/shop';
const ORDERS = `${MODULE}/sales/orders`;

function file(path, extra = {}) {
  return {
    path,
    package: path.split('/').at(-2) ?? 'shop',
    test: path.endsWith('_test.go'),
    generated: false,
    constrained: false,
    ...extra,
  };
}

function type(path, name, tokens = [name, 'struct', '{', '}']) {
  return { file: path, name, kind: 'type', line: 3, lines: 1, exported: true, tokens };
}

function usage(path, extra = {}) {
  return { file: path, imports: [], names: [], selectors: [], local: [], ...extra };
}

const orders = (from, qualifier = 'orders') =>
  usage(from, {
    imports: [{ path: ORDERS, name: qualifier === 'orders' ? '' : qualifier, line: 3 }],
    selectors: [{ qualifier, name: 'Order' }],
  });

const REPORT = {
  files: [
    file('sales/sales.go'),
    file('sales/orders/order.go'),
    file('billing/invoice.go'),
    file('billing/invoice_test.go'),
    file('sales/report.go'),
    file('cmd/app/main.go', { package: 'main' }),
  ],
  definitions: [
    type('sales/sales.go', 'Order', ['Order', '=', 'orders', '.', 'Order']),
    type('sales/orders/order.go', 'Order'),
    type('billing/invoice.go', 'Invoice'),
  ],
  usages: [
    orders('sales/sales.go'),
    orders('billing/invoice.go', 'o'),
    orders('billing/invoice_test.go'),
    orders('sales/report.go'),
    orders('cmd/app/main.go'),
  ],
};

describe('Go public alternatives', () => {
  const facts = goFacts(REPORT, { module: MODULE });

  it('reads an exported type alias of a subpackage type as a re-export', () => {
    expect(goReexports(REPORT, MODULE)).toEqual([
      {
        from: 'sales/sales.go',
        to: 'sales/orders/order.go',
        names: [{ name: 'Order' }],
        reexport: true,
      },
    ]);
  });

  it('fails production code outside the folder that imports around the alias', () => {
    const findings = goEntryPointFindings(REPORT, { facts, module: MODULE });

    expect(findings.map(({ path, rule }) => `${rule} ${path}`)).toEqual([
      'public-alternative-bypass billing/invoice.go',
    ]);
    expect(findings[0].message).toBe(
      `Order is imported from sales/orders/order.go, around its public entry point ${MODULE}/sales. Import Order from ${MODULE}/sales. If this is intended, add {"rule":"public-alternative-bypass","paths":["billing/invoice.go"],"reason":"..."} to "exceptions" in nitpicker.config.json.`,
    );
  });

  it('leaves the folder itself, tests, package main and an excepted file alone', () => {
    const exceptions = [
      { rule: 'public-alternative-bypass', paths: ['billing/invoice.go'], reason: 'fixture' },
    ];

    expect(goEntryPointFindings(REPORT, { facts, module: MODULE, exceptions })).toEqual([]);
  });

  it('ignores an alias of a type outside its folder', () => {
    const report = {
      ...REPORT,
      files: [...REPORT.files, file('api/api.go')],
      definitions: [
        ...REPORT.definitions,
        type('api/api.go', 'Order', ['Order', '=', 'orders', '.', 'Order']),
      ],
      usages: [...REPORT.usages, orders('api/api.go')],
    };

    expect(goReexports(report, MODULE).map(({ from }) => from)).toEqual(['sales/sales.go']);
  });
});
