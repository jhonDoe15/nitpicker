import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import { sharedFactFindings } from '../facts/evaluate.mjs';
import { rows } from '../facts/test-support/fact-fixtures.mjs';
import { featureCycleEdges } from './feature-cycles.mjs';
import { featureRoleContract, PUBLIC_FACES } from './feature-roles.mjs';

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
      `Keep dependencies between features one-way: ${FEATURES}/billing/invoice.py in feature billing imports feature shipping (${FEATURES}/shipping/api.py, ${FEATURES}/shipping/rates.py), and shipping depends back on billing, a cycle between features billing, shipping. Move what both need to a shared root, invert this dependency behind an interface billing owns that the composition root wires, or merge the features. ${exceptionHint(RULE, `${FEATURES}/billing/invoice.py`)}`,
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
      `Keep dependencies between features one-way: ${FEATURES}/orders/cart.py in feature orders imports feature shipping (${FEATURES}/shipping/__init__.py), and shipping depends back on orders, a cycle between features billing, orders, shipping. Move what both need to a shared root, invert this dependency behind an interface orders owns that the composition root wires, or merge the features. ${exceptionHint(RULE, `${FEATURES}/orders/cart.py`)}`,
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

  it('gives the edges inside a cycle to a runner that drops its own duplicate findings', () => {
    const roleOf = featureRoleContract({}, PUBLIC_FACES.python);
    const edges = featureCycleEdges(
      factsOf([
        edge('billing/invoice.py', 'shipping/api.py'),
        edge('shipping/label.py', 'billing/__init__.py'),
        edge('orders/cart.py', 'billing/__init__.py'),
      ]),
      roleOf,
    );

    expect(edges.map(({ from, to, cycle }) => [from, to, cycle])).toEqual([
      [
        `${FEATURES}/billing/invoice.py`,
        `${FEATURES}/shipping/api.py`,
        [`${FEATURES}/billing`, `${FEATURES}/shipping`],
      ],
      [
        `${FEATURES}/shipping/label.py`,
        `${FEATURES}/billing/__init__.py`,
        [`${FEATURES}/billing`, `${FEATURES}/shipping`],
      ],
    ]);
  });
});
