import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import { sharedFactFindings } from '../facts/evaluate.mjs';
import { exception, rows } from '../facts/test-support/fact-fixtures.mjs';
import { PUBLIC_FACES } from './feature-roles.mjs';

const INTERNAL = 'feature-internal-import';
const SHARED = 'shared-imports-feature';
const ROOT = 'src/app';
const BILLING = `${ROOT}/features/billing`;
const ORDERS = `${ROOT}/features/orders`;

function edge(from, to, extra = {}) {
  return { from, to, names: [{ name: '*' }], ...extra };
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

function findingsOf(facts, rules, policy = {}) {
  return sharedFactFindings(facts, {
    language: 'python',
    analyzerName: 'coupling',
    rules,
    policy,
    publicFace: PUBLIC_FACES.python,
  });
}

describe('feature-internal-import', () => {
  it('reports imports of a private module or a sub-package from outside the feature', () => {
    const facts = factsOf([
      edge(`${ORDERS}/cart.py`, `${BILLING}/_rates.py`),
      edge(`${ORDERS}/cart.py`, `${BILLING}/internal/tax.py`, { typeOnly: true }),
      edge(`${ORDERS}/cart.py`, `${BILLING}/internal/__init__.py`),
      edge(`${ROOT}/main.py`, `${BILLING}/_rates.py`),
    ]);

    expect(rows(findingsOf(facts, [INTERNAL]))).toEqual([
      [INTERNAL, `${ORDERS}/cart.py`, `feature-internal:${BILLING}/_rates.py`],
      [INTERNAL, `${ORDERS}/cart.py`, `feature-internal:${BILLING}/internal/__init__.py`],
      [INTERNAL, `${ORDERS}/cart.py`, `feature-internal:${BILLING}/internal/tax.py`],
      [INTERNAL, `${ROOT}/main.py`, `feature-internal:${BILLING}/_rates.py`],
    ]);
  });

  it('allows the public face, re-exports through __init__, the feature itself and tests', () => {
    const facts = factsOf(
      [
        edge(`${ORDERS}/cart.py`, `${BILLING}/__init__.py`, { names: [{ name: 'rate' }] }),
        edge(`${ORDERS}/cart.py`, `${BILLING}/api.py`),
        edge(`${BILLING}/__init__.py`, `${BILLING}/_rates.py`, {
          names: [{ name: 'rate' }],
          reexport: true,
        }),
        edge(`${BILLING}/api.py`, `${BILLING}/internal/tax.py`),
        edge('tests/billing/test_rates.py', `${BILLING}/_rates.py`),
      ],
      ['tests/billing/test_rates.py'],
    );

    expect(findingsOf(facts, [INTERNAL, SHARED])).toEqual([]);
  });

  it('allows a sub-package the __init__ re-exports whole, but not a module it takes a name from', () => {
    const facts = factsOf([
      edge(`${BILLING}/__init__.py`, `${BILLING}/models/__init__.py`, { reexport: true }),
      edge(`${BILLING}/__init__.py`, `${BILLING}/internal/tax.py`, {
        names: [{ name: 'tax' }],
        reexport: true,
      }),
      edge(`${ORDERS}/cart.py`, `${BILLING}/models/__init__.py`),
      edge(`${ORDERS}/cart.py`, `${BILLING}/internal/tax.py`),
    ]);

    expect(rows(findingsOf(facts, [INTERNAL]))).toEqual([
      [INTERNAL, `${ORDERS}/cart.py`, `feature-internal:${BILLING}/internal/tax.py`],
    ]);
  });

  it('never reports an import of or from a generated module', () => {
    const facts = factsOf([
      edge(`${ORDERS}/cart.py`, `${BILLING}/generated/stub_pb2.py`),
      edge(`${ORDERS}/generated/client_pb2.py`, `${BILLING}/_rates.py`),
    ]);
    const generated = {
      ...facts,
      modules: facts.modules.map((module) => ({
        ...module,
        generated: module.file.includes('/generated/'),
      })),
    };

    expect(findingsOf(generated, [INTERNAL, SHARED])).toEqual([]);
  });

  it('names the importer, the module and the public face, and ends with the exception', () => {
    const facts = factsOf([edge(`${ORDERS}/cart.py`, `${BILLING}/_rates.py`)]);

    expect(findingsOf(facts, [INTERNAL])[0]).toEqual({
      tool: 'coupling',
      rule: INTERNAL,
      path: `${ORDERS}/cart.py`,
      identity: `feature-internal:${BILLING}/_rates.py`,
      message: `Import feature billing only through ${BILLING}/__init__.py (re-export names or sub-packages there) or a module directly in ${BILLING}/ not starting with "_": ${ORDERS}/cart.py imports its internal module ${BILLING}/_rates.py. Expose what it needs there, or move the code both use to a shared root. ${exceptionHint(INTERNAL, `${ORDERS}/cart.py`)}`,
      classification: 'enforceable',
    });
  });

  it('honours an exception for the importing file', () => {
    const facts = factsOf([edge(`${ROOT}/main.py`, `${BILLING}/_rates.py`)]);

    expect(
      findingsOf(facts, [INTERNAL], { exceptions: [exception(INTERNAL, `${ROOT}/main.py`)] }),
    ).toEqual([]);
  });
});

describe('shared-imports-feature', () => {
  it('reports a shared module once per feature it imports, public face or not', () => {
    const facts = factsOf([
      edge(`${ROOT}/shared/money.py`, `${BILLING}/api.py`),
      edge(`${ROOT}/shared/money.py`, `${BILLING}/_rates.py`, { typeOnly: true }),
      edge(`${ROOT}/shared/money.py`, `${ORDERS}/__init__.py`),
      edge(`${ROOT}/shared/ids.py`, `${ROOT}/shared/money.py`),
    ]);

    const findings = findingsOf(facts, [INTERNAL, SHARED]);

    expect(rows(findings)).toEqual([
      [SHARED, `${ROOT}/shared/money.py`, `${BILLING}|${SHARED}`],
      [SHARED, `${ROOT}/shared/money.py`, `${ORDERS}|${SHARED}`],
    ]);
    expect(findings[0].message).toBe(
      `Shared code imports only shared code: ${ROOT}/shared/money.py is shared and imports feature billing (${BILLING}/_rates.py, ${BILLING}/api.py). Move what it needs into a shared root, pass it in from the composition root, or move ${ROOT}/shared/money.py into billing. ${exceptionHint(SHARED, `${ROOT}/shared/money.py`)}`,
    );
  });

  it('reads the shared and feature roots from the layout, where [] turns the rules off', () => {
    const facts = factsOf([edge('pkg/common/money.py', 'pkg/modules/billing/_rates.py')]);
    const layout = { sharedRoots: ['**/common'], featureRoots: ['pkg/modules'] };

    expect(rows(findingsOf(facts, [SHARED], { layout }))).toEqual([
      [SHARED, 'pkg/common/money.py', `pkg/modules/billing|${SHARED}`],
    ]);
    expect(findingsOf(facts, [SHARED, INTERNAL], { layout: { featureRoots: [] } })).toEqual([]);
  });

  it('fails without a public face instead of guessing one', () => {
    expect(() =>
      sharedFactFindings(factsOf([]), {
        language: 'python',
        analyzerName: 'coupling',
        rules: [SHARED],
      }),
    ).toThrow(/"publicFace" must be/u);
  });
});
