import { describe, expect, it } from 'vitest';
import { MESSAGES, messageFields } from '../../policy.mjs';
import { exceptionText } from '../exceptions.mjs';
import { sharedFactFindings } from '../facts/evaluate.mjs';
import { publicAlternativeBypasses } from './public-alternatives.mjs';

const RULE = 'public-alternative-bypass';
const ENTRY = 'app/billing/__init__.py';
const INVOICE = 'app/billing/invoice.py';
const CART = 'app/orders/cart.py';

function modules(...files) {
  return files.map((file) => ({ file, role: file.startsWith('tests/') ? 'test' : 'production' }));
}

function edge(from, to, names, extra = {}) {
  return {
    from,
    to,
    names: names.map((name) => (typeof name === 'string' ? { name } : name)),
    ...extra,
  };
}

function reexport(from, to, names) {
  return edge(from, to, names, { reexport: true });
}

function bypasses(imports, files = [ENTRY, INVOICE, CART], definitions = []) {
  return publicAlternativeBypasses({ modules: modules(...files), definitions, imports });
}

describe('public-alternative-bypass over facts', () => {
  it('reports an import from inside a package whose entry re-exports the name', () => {
    const imports = [reexport(ENTRY, INVOICE, ['Invoice']), edge(CART, INVOICE, ['Invoice'])];

    expect(bypasses(imports)).toEqual([
      { source: CART, target: INVOICE, entry: ENTRY, names: ['Invoice'] },
    ]);
  });

  it('keeps imports from inside the package, of names the entry does not re-export, and of tests', () => {
    const local = 'app/billing/refund.py';
    const imports = [
      reexport(ENTRY, INVOICE, ['Invoice']),
      edge(local, INVOICE, ['Invoice']),
      edge(CART, INVOICE, ['_rate']),
      edge('tests/test_cart.py', INVOICE, ['Invoice']),
      edge(CART, INVOICE, ['*']),
      edge(CART, INVOICE, ['Invoice'], { conditional: true }),
    ];

    expect(bypasses(imports, [ENTRY, INVOICE, CART, local, 'tests/test_cart.py'])).toEqual([]);
  });

  it('follows re-export chains and points at the outermost entry the importer is outside of', () => {
    const inner = 'app/billing/internal/__init__.py';
    const tax = 'app/billing/internal/tax.py';
    const top = 'app/__init__.py';
    const imports = [
      reexport(inner, tax, [{ name: 'Tax', alias: 'Rate' }]),
      reexport(ENTRY, inner, ['Rate']),
      reexport(top, ENTRY, ['Rate']),
      edge(CART, tax, ['Tax']),
      edge('lib/report.py', tax, ['Tax']),
    ];
    const files = [top, ENTRY, inner, tax, CART, 'lib/report.py'];

    expect(bypasses(imports, files)).toEqual([
      { source: CART, target: tax, entry: ENTRY, names: ['Tax'] },
      { source: 'lib/report.py', target: tax, entry: top, names: ['Tax'] },
    ]);
  });

  it('reads a star re-export as every exported name of the module, and a module re-export as none', () => {
    const definitions = [
      { file: INVOICE, name: 'Invoice', exported: true },
      { file: INVOICE, name: '_draft', exported: false },
    ];
    const star = [reexport(ENTRY, INVOICE, ['*']), edge(CART, INVOICE, ['Invoice', '_draft'])];
    const asModule = [
      reexport(ENTRY, INVOICE, [{ name: '*', alias: 'invoice' }]),
      edge(CART, INVOICE, ['Invoice']),
    ];

    expect(bypasses(star, undefined, definitions).map(({ names }) => names)).toEqual([['Invoice']]);
    expect(bypasses(asModule, undefined, definitions)).toEqual([]);
  });

  it('reports through the shared fact engine with the entry in the message', () => {
    const facts = {
      modules: modules(ENTRY, INVOICE, CART),
      definitions: [],
      imports: [reexport(ENTRY, INVOICE, ['Invoice']), edge(CART, INVOICE, ['Invoice'])],
    };
    const findings = sharedFactFindings(facts, {
      language: 'python',
      analyzerName: 'facts',
      rules: [RULE],
    });

    expect(findings).toEqual([
      {
        tool: 'facts',
        rule: RULE,
        path: CART,
        identity: `target:${INVOICE}`,
        ...messageFields(MESSAGES.publicAlternativeBypass, {
          names: 'Invoice',
          target: INVOICE,
          entry: ENTRY,
          exception: exceptionText(RULE, CART),
        }),
        classification: 'enforceable',
      },
    ]);
    expect(
      sharedFactFindings(facts, {
        language: 'python',
        analyzerName: 'facts',
        rules: [RULE],
        policy: { exceptions: [{ rule: RULE, paths: [CART] }] },
      }),
    ).toEqual([]);
  });
});
