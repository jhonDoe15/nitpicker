import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import { featureFactAnalysis, sharedFactFindings } from '../facts/evaluate.mjs';
import { rows } from '../facts/test-support/fact-fixtures.mjs';
import { PUBLIC_FACES } from './feature-roles.mjs';

const RULE = 'feature-cycle';
const FEATURES = 'src/app/features';

function edge(from, to, extra = {}) {
  return { from: `${FEATURES}/${from}`, to: `${FEATURES}/${to}`, names: [], ...extra };
}

function factsOf(imports, tests = []) {
  const files = [...new Set(imports.flatMap(({ from, to }) => [from, to]))];
  return {
    modules: files.map((file) => ({
      file,
      role: tests.includes(file) ? 'test' : 'production',
    })),
    imports,
  };
}

function cycleFindings(imports, tests) {
  return sharedFactFindings(factsOf(imports, tests), {
    language: 'python',
    analyzerName: 'coupling',
    rules: [RULE],
    publicFace: PUBLIC_FACES.python,
  });
}

describe('feature-cycle', () => {
  it('reports each importer once per feature it imports inside a cycle', () => {
    const findings = cycleFindings([
      edge('billing/invoice.py', 'shipping/api.py'),
      edge('billing/invoice.py', 'shipping/rates.py'),
      edge('shipping/label.py', 'billing/__init__.py'),
      edge('orders/cart.py', 'billing/__init__.py'),
    ]);

    expect(rows(findings)).toEqual([
      [RULE, `${FEATURES}/billing/invoice.py`, `${FEATURES}/shipping|${RULE}`],
      [RULE, `${FEATURES}/shipping/label.py`, `${FEATURES}/billing|${RULE}`],
    ]);
    expect(findings[0].message).toBe(
      `Keep feature dependencies one-way: ${FEATURES}/billing/invoice.py in billing imports shipping (${FEATURES}/shipping/api.py, ${FEATURES}/shipping/rates.py), which depends back on billing (cycle: billing, shipping). Move what both need to a shared root, or invert this import behind an interface. ${exceptionHint(RULE, `${FEATURES}/billing/invoice.py`)}`,
    );
  });

  it('finds a cycle of three features and names them all', () => {
    const findings = cycleFindings([
      edge('billing/invoice.py', 'orders/__init__.py'),
      edge('orders/cart.py', 'shipping/__init__.py'),
      edge('shipping/label.py', 'billing/__init__.py'),
    ]);

    expect(findings.map(({ path }) => path)).toEqual([
      `${FEATURES}/billing/invoice.py`,
      `${FEATURES}/orders/cart.py`,
      `${FEATURES}/shipping/label.py`,
    ]);
    expect(findings[1].message).toBe(
      `Keep feature dependencies one-way: ${FEATURES}/orders/cart.py in orders imports shipping (${FEATURES}/shipping/__init__.py), which depends back on orders (cycle: billing, orders, shipping). Move what both need to a shared root, or invert this import behind an interface. ${exceptionHint(RULE, `${FEATURES}/orders/cart.py`)}`,
    );
  });

  it('leaves out imports only the type checker reads, tests, and modules outside features', () => {
    expect(
      cycleFindings(
        [
          edge('billing/invoice.py', 'shipping/api.py'),
          edge('shipping/label.py', 'billing/__init__.py', { typeOnly: true }),
          edge('shipping/test_label.py', 'billing/__init__.py'),
          { from: `${FEATURES}/shipping/label.py`, to: 'src/app/core.py', names: [] },
          { from: 'src/app/core.py', to: `${FEATURES}/billing/__init__.py`, names: [] },
        ],
        [`${FEATURES}/shipping/test_label.py`],
      ),
    ).toEqual([]);
  });

  it('keeps its identity when the importer or the imported module moves inside its feature', () => {
    const before = cycleFindings([
      edge('billing/invoice.py', 'shipping/api.py'),
      edge('shipping/label.py', 'billing/__init__.py'),
    ]);
    const after = cycleFindings([
      edge('billing/documents/invoice.py', 'shipping/public.py'),
      edge('shipping/label.py', 'billing/__init__.py'),
    ]);

    expect(after.map(({ identity }) => identity)).toEqual(before.map(({ identity }) => identity));
    expect(after[0].path).toBe(`${FEATURES}/billing/documents/invoice.py`);
  });

  it('names the cycles it reported and the edges inside them', () => {
    const analysis = featureFactAnalysis(
      factsOf([
        edge('billing/invoice.py', 'shipping/api.py'),
        edge('shipping/label.py', 'billing/__init__.py'),
        edge('orders/cart.py', 'billing/__init__.py'),
      ]),
      { language: 'python', analyzerName: 'coupling', publicFace: PUBLIC_FACES.python },
    );

    expect(analysis.explainedCycles).toEqual([
      {
        features: [`${FEATURES}/billing`, `${FEATURES}/shipping`],
        edges: [
          { from: `${FEATURES}/billing/invoice.py`, to: `${FEATURES}/shipping/api.py` },
          { from: `${FEATURES}/shipping/label.py`, to: `${FEATURES}/billing/__init__.py` },
        ],
      },
    ]);
    expect(analysis.featureOf(`${FEATURES}/orders/cart.py`)).toBe(`${FEATURES}/orders`);
    expect(analysis.featureOf('src/app/main.py')).toBeUndefined();
  });

  it('explains no cycle whose findings an exception drops', () => {
    const analysis = featureFactAnalysis(
      factsOf([
        edge('billing/invoice.py', 'shipping/api.py'),
        edge('shipping/label.py', 'billing/__init__.py'),
      ]),
      {
        language: 'python',
        analyzerName: 'coupling',
        publicFace: PUBLIC_FACES.python,
        policy: { exceptions: [{ rule: RULE, paths: ['src/**'] }] },
      },
    );

    expect(analysis).toEqual({
      findings: [],
      explainedCycles: [],
      featureOf: expect.any(Function),
    });
  });
});
