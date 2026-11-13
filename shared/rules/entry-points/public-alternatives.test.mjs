import { describe, expect, it } from 'vitest';
import { MESSAGES, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';
import { sharedFactFindings } from '../facts/evaluate.mjs';
import { publicAlternativeBypasses } from './public-alternatives.mjs';

const RULE = 'public-alternative-bypass';
const ENTRY = 'app/billing/__init__.py';
const INVOICE = 'app/billing/invoice.py';
const CART = 'app/orders/cart.py';

function entry(file, publicNames, entryName) {
  return { file, role: 'production', publicNames, entryName };
}

function plain(...files) {
  return files.map((file) => ({ file, role: file.startsWith('tests/') ? 'test' : 'production' }));
}

function edge(from, to, names, extra = {}) {
  const listed = names.map((name) => (typeof name === 'string' ? { name } : name));
  return { from, to, names: listed, ...extra };
}

function reexport(from, to, names) {
  return edge(from, to, names, { reexport: true });
}

const BILLING = entry(ENTRY, ['Invoice', 'Bill'], 'app.billing');

function bypasses(imports, modules = [BILLING, ...plain(INVOICE, CART)]) {
  return publicAlternativeBypasses({ modules, imports });
}

describe('public-alternative-bypass over facts', () => {
  it('reports an import from inside a folder whose entry point re-exports the name', () => {
    const imports = [
      reexport(ENTRY, INVOICE, ['Invoice', { name: 'Draft', alias: 'Bill' }]),
      edge(CART, INVOICE, ['Invoice', 'Draft']),
    ];

    expect(bypasses(imports)).toEqual([
      {
        source: CART,
        target: INVOICE,
        entry: ENTRY,
        entryName: 'app.billing',
        names: ['Draft', 'Invoice'],
        publicNames: ['Bill', 'Invoice'],
      },
    ]);
  });

  it('keeps imports from inside the folder, of names the entry does not list, and from tests', () => {
    const local = 'app/billing/refund.py';
    const imports = [
      reexport(ENTRY, INVOICE, ['Invoice', 'helper']),
      edge(local, INVOICE, ['Invoice']),
      edge(CART, INVOICE, ['helper', '*']),
      edge('tests/test_cart.py', INVOICE, ['Invoice']),
    ];
    const modules = [BILLING, ...plain(INVOICE, CART, local, 'tests/test_cart.py')];

    expect(bypasses(imports, modules)).toEqual([]);
  });

  it.each([
    ['in a try that catches ImportError', { conditional: true }],
    ['for the type checker only', { typeOnly: true }],
    ['inside a function', { local: true }],
    ['that is itself a re-export', { reexport: true }],
  ])('keeps an import %s', (_, extra) => {
    const imports = [
      reexport(ENTRY, INVOICE, ['Invoice']),
      edge(CART, INVOICE, ['Invoice'], extra),
    ];

    expect(bypasses(imports)).toEqual([]);
  });

  it('keeps composition roots and entries, which wire the internals together', () => {
    const imports = [reexport(ENTRY, INVOICE, ['Invoice']), edge(CART, INVOICE, ['Invoice'])];
    function importer(fields) {
      return [BILLING, ...plain(INVOICE), { file: CART, role: 'production', ...fields }];
    }

    expect(bypasses(imports, importer({ compositionRoot: true }))).toEqual([]);
    expect(bypasses(imports, importer({ entry: true }))).toEqual([]);
  });

  it('only takes re-exports of a module that lists its public names', () => {
    const imports = [reexport(ENTRY, INVOICE, ['Invoice']), edge(CART, INVOICE, ['Invoice'])];

    expect(bypasses(imports, plain(ENTRY, INVOICE, CART))).toEqual([]);
  });

  it('follows re-export chains and names the outermost entry the importer is outside of', () => {
    const inner = 'app/billing/internal/__init__.py';
    const tax = 'app/billing/internal/tax.py';
    const top = 'app/__init__.py';
    const report = 'lib/report.py';
    const imports = [
      reexport(inner, tax, [{ name: 'Tax', alias: 'Rate' }]),
      reexport(ENTRY, inner, ['Rate']),
      reexport(top, ENTRY, ['Rate']),
      edge(CART, tax, ['Tax']),
      edge(report, tax, ['Tax']),
    ];
    const modules = [
      entry(top, ['Rate'], 'app'),
      entry(ENTRY, ['Rate'], 'app.billing'),
      entry(inner, ['Rate'], 'app.billing.internal'),
      ...plain(tax, CART, report),
    ];

    expect(
      bypasses(imports, modules).map(({ source, entryName, publicNames }) => [
        source,
        entryName,
        publicNames,
      ]),
    ).toEqual([
      [CART, 'app.billing', ['Rate']],
      [report, 'app', ['Rate']],
    ]);
  });

  it('reports through the shared fact engine with the public import in the message', () => {
    const facts = {
      modules: [BILLING, ...plain(INVOICE, CART)],
      imports: [reexport(ENTRY, INVOICE, ['Invoice']), edge(CART, INVOICE, ['Invoice'])],
    };
    function run(policy) {
      return sharedFactFindings(facts, {
        language: 'python',
        analyzerName: 'facts',
        rules: [RULE],
        policy,
      });
    }

    expect(run()).toEqual([
      {
        tool: 'facts',
        rule: RULE,
        path: CART,
        identity: `target:${INVOICE}`,
        ...messageFields(MESSAGES.publicAlternativeBypass, {
          names: 'Invoice',
          target: INVOICE,
          entry: 'app.billing',
          publicNames: 'Invoice',
          exception: exceptionText(RULE, CART),
        }),
        classification: 'enforceable',
      },
    ]);
    expect(run({ exceptions: [{ rule: RULE, paths: [CART] }] })).toEqual([]);
  });
});
