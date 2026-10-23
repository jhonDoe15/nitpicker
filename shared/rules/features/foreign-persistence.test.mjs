import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../exceptions.mjs';
import { exception, findingsOf, rows } from '../facts/test-support/fact-fixtures.mjs';

const RULE = 'foreign-feature-persistence';
const ROOT = 'src/app';
const BILLING = `${ROOT}/features/billing`;
const ORDERS = `${ROOT}/features/orders`;

function edge(from, to, names = ['*'], extra = {}) {
  return { from, to, names: names.map((name) => ({ name })), ...extra };
}

function factsOf(imports, { persistence = {}, tests = [] } = {}) {
  const files = [...new Set(imports.flatMap(({ from, to }) => [from, to]))];
  return {
    modules: files.map((file) => ({
      file,
      role: tests.includes(file) ? 'test' : 'production',
      ...(persistence[file] === undefined ? {} : { persistence: persistence[file] }),
    })),
    imports,
  };
}

function findings(facts, policy = {}) {
  return findingsOf(facts, [RULE], { language: 'python', analyzerName: 'coupling', policy });
}

const PERSISTENCE = {
  [`${BILLING}/models.py`]: 'entity',
  [`${BILLING}/repository.py`]: 'data-access',
};

describe('foreign-feature-persistence', () => {
  it("reports a feature module using another feature's entity or data access module", () => {
    const facts = factsOf(
      [
        edge(`${ORDERS}/cart.py`, `${BILLING}/models.py`, ['Invoice']),
        edge(`${ORDERS}/cart.py`, `${BILLING}/repository.py`, ['InvoiceRepository']),
      ],
      { persistence: PERSISTENCE },
    );

    expect(findings(facts)).toEqual([
      {
        tool: 'coupling',
        rule: RULE,
        path: `${ORDERS}/cart.py`,
        identity: `foreign-persistence:${BILLING}/models.py`,
        message: `Use feature billing through its services, not its persistence: ${ORDERS}/cart.py in feature orders uses its persistent entity ${BILLING}/models.py. Call a service billing exposes on its public face, or keep a read model of your own fed by billing's events or queries. ${exceptionHint(RULE, `${ORDERS}/cart.py`)}`,
        classification: 'enforceable',
      },
      {
        tool: 'coupling',
        rule: RULE,
        path: `${ORDERS}/cart.py`,
        identity: `foreign-persistence:${BILLING}/repository.py`,
        message: `Use feature billing through its services, not its persistence: ${ORDERS}/cart.py in feature orders uses its data access module ${BILLING}/repository.py. Call a service billing exposes on its public face, or keep a read model of your own fed by billing's events or queries. ${exceptionHint(RULE, `${ORDERS}/cart.py`)}`,
        classification: 'enforceable',
      },
    ]);
  });

  it('follows the names re-exported through the public face, and only those', () => {
    const face = `${BILLING}/__init__.py`;
    const facts = factsOf(
      [
        edge(`${ORDERS}/cart.py`, face, ['InvoiceRepository']),
        edge(`${ORDERS}/totals.py`, face, ['bill']),
        edge(`${ORDERS}/report.py`, face, ['*']),
        edge(face, `${BILLING}/service.py`, ['bill'], { reexport: true }),
        edge(face, `${BILLING}/_store.py`, ['*'], { reexport: true }),
        edge(`${BILLING}/_store.py`, `${BILLING}/repository.py`, ['InvoiceRepository'], {
          reexport: true,
        }),
        edge(`${BILLING}/service.py`, `${BILLING}/repository.py`, ['InvoiceRepository']),
      ],
      { persistence: PERSISTENCE },
    );

    const found = findings(facts);

    expect(rows(found)).toEqual([
      [RULE, `${ORDERS}/cart.py`, `foreign-persistence:${BILLING}/repository.py`],
      [RULE, `${ORDERS}/report.py`, `foreign-persistence:${BILLING}/repository.py`],
    ]);
    expect(found[0].message).toBe(
      `Use feature billing through its services, not its persistence: ${ORDERS}/cart.py in feature orders uses its data access module ${BILLING}/repository.py through ${face}, ${BILLING}/_store.py. Call a service billing exposes on its public face, or keep a read model of your own fed by billing's events or queries. ${exceptionHint(RULE, `${ORDERS}/cart.py`)}`,
    );
  });

  it('allows the feature itself, shared and outside code, tests and the excepted files', () => {
    const facts = factsOf(
      [
        edge(`${BILLING}/service.py`, `${BILLING}/models.py`),
        edge(`${ROOT}/shared/audit.py`, `${BILLING}/models.py`),
        edge(`${ROOT}/main.py`, `${BILLING}/repository.py`),
        edge(`${ORDERS}/test_cart.py`, `${BILLING}/models.py`),
        edge(`${ORDERS}/summary.py`, `${BILLING}/models.py`),
        edge(`${ORDERS}/views.py`, `${BILLING}/repository.py`),
      ],
      { persistence: PERSISTENCE, tests: [`${ORDERS}/test_cart.py`] },
    );

    expect(
      findings(facts, {
        exceptions: [exception(RULE, `${BILLING}/models.py`), exception(RULE, `${ORDERS}/views.py`)],
      }),
    ).toEqual([]);
  });

  it('reads the feature folders from the layout', () => {
    const facts = factsOf([edge('pkg/orders/cart.py', 'pkg/billing/models.py')], {
      persistence: { 'pkg/billing/models.py': 'entity' },
    });

    expect(rows(findings(facts, { layout: { featureRoots: ['pkg'] } }))).toEqual([
      [RULE, 'pkg/orders/cart.py', 'foreign-persistence:pkg/billing/models.py'],
    ]);
  });
});
