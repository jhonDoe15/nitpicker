import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mjs';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mjs';
import { code } from '../fixtures/source.mjs';
import { stepsOf } from '../report/view.mjs';

const PAID_A = 'paid-before-publish|bus.publish|A';

function analyzed(name, bounds) {
  const fixture = fixtureNamed(name);
  const options = { file: fixture.file, text: fixture.source, entry: fixture.entry };
  return analyzeSource({
    ...options,
    contracts: ORDER_CONTRACTS,
    inputs: ORDER_INPUTS,
    bounds: bounds ?? fixture.bounds,
  }).result;
}

function analyzedText(text, contracts = ORDER_CONTRACTS) {
  const options = { file: 'snippet.ts', text, entry: 'payOrder', contracts };
  return analyzeSource({ ...options, inputs: ORDER_INPUTS }).result;
}

function snippet(body) {
  return `export function payOrder(order, other, flag2, db, bus) {\n${body}\n}\n`;
}

function label(result) {
  return {
    status: result.status,
    reasons: [...new Set(result.reasons.map((item) => item.reason))].sort(),
    violations: result.violations.map((item) => item.observation).sort(),
  };
}

function outline(result) {
  return {
    status: result.status,
    reasons: [...new Set(result.reasons.map((item) => item.reason))].sort(),
    violations: result.violations.map((item) => `${item.observation} ${item.certainty}`),
  };
}

function violation(result, observation) {
  return result.violations.find((item) => item.observation === observation);
}

describe('hand-labeled fixtures', () => {
  it.each(FIXTURES.map((fixture) => [fixture.name, fixture]))(
    '%s matches its label',
    (_name, fixture) => {
      expect(label(analyzed(fixture.name))).toEqual({
        status: fixture.expect.status,
        reasons: [...fixture.expect.reasons].sort(),
        violations: [...fixture.expect.violations].sort(),
      });
    },
  );

  it('is partial exactly when it lists a reason', () => {
    const inconsistent = FIXTURES.map((fixture) => [fixture.name, analyzed(fixture.name)]).filter(
      ([, result]) => (result.status === 'partial') !== result.reasons.length > 0,
    );

    expect(inconsistent.map(([name]) => name)).toEqual([]);
  });
});

describe('path sensitivity', () => {
  it('keeps a commit on one branch from establishing it on the other', () => {
    const found = violation(analyzed('branch-only-commit'), PAID_A);

    expect([found.certainty, stepsOf(found.witness)]).toEqual([
      'definite',
      ['order.status !== "pending" is false (2:7)', 'flag is false (5:7)'],
    ]);
  });

  it('treats a caught commit failure as a failure path', () => {
    const found = violation(analyzed('caught-failure-publishes'), PAID_A);

    expect([stepsOf(found.witness), found.line, found.column]).toEqual([
      [
        'order.status !== "pending" is false (2:7)',
        'db.commit(A to paid) failure (6:5)',
        'caught at 5:3',
      ],
      10,
      3,
    ]);
  });

  it('never treats an ambiguous commit as a definite no-write', () => {
    const found = violation(
      analyzed('ambiguous-compensation'),
      'order-status|db.commit|A|paid|cancelled',
    );

    expect(stepsOf(found.witness)).toEqual([
      'order.status !== "pending" is false (2:7)',
      'db.commit(A to paid) ambiguous (6:5)',
      'caught at 5:3',
    ]);
  });

  it('forgets what an unknown call may change in the objects it receives', () => {
    const result = analyzed('unknown-helper');

    expect([result.reasons, outline(result).violations]).toEqual([
      [
        { reason: 'unknown-call', line: 7, column: 3, detail: './audit#audit' },
        { reason: 'unknown-entity', line: 8, column: 3, detail: 'argument 0' },
        { reason: 'unknown-state', line: 8, column: 3, detail: '?' },
        { reason: 'unknown-entity', line: 9, column: 3, detail: 'argument 1' },
      ],
      ['order-status|db.commit|?|?|paid possible', 'paid-before-publish|bus.publish|? possible'],
    ]);
  });

  it('prunes branches whose guards contradict earlier decisions', () => {
    const result = analyzed('contradictory-guards');

    expect([
      result.violations,
      result.paths.map((path) => path.guards.map((guard) => guard.value)),
    ]).toEqual([[], [[true, false], [false]]]);
  });

  it('distinguishes entities by identity, not by the effect name', () => {
    const { events } = violation(
      analyzed('alias-wrong-entity'),
      'paid-before-publish|bus.publish|B',
    ).witness;

    expect(events.map((event) => [event.callee, event.entity, event.outcome, event.to])).toEqual([
      ['db.commit', 'A', 'success', 'paid'],
    ]);
  });
});

describe('soundness of the supported subset', () => {
  it.each([
    [
      'logical assignment',
      `let s = 'a';\ns ||= 'b';\nif (s === 'a') { bus.publish('OrderPaid', order.id); }`,
    ],
    [
      'nullish assignment',
      `let s = order.id;\ns ??= 'b';\nif (s === 'A') { bus.publish('OrderPaid', order.id); }`,
    ],
    [
      'assignment expression',
      `let s = 'a';\nif ((s = 'b') === 'b') { bus.publish('OrderPaid', order.id); }`,
    ],
    ['decrement', `let n = 1;\nn--;\nif (n === 1) { bus.publish('OrderPaid', order.id); }`],
  ])('treats a %s as a mutation that makes the result partial', (_name, body) => {
    expect(outline(analyzedText(snippet(body)))).toEqual({
      status: 'partial',
      reasons: ['unknown-guard', 'unsupported-syntax'],
      violations: [`${PAID_A} possible`],
    });
  });

  it.each([
    ['an undeclared field compared loosely', [], 'order.total == 3'],
    ['two undeclared fields', [], 'order.total === other.total'],
    ['an unconstrained parameter', [], 'flag2'],
    ['typeof', ['unsupported-syntax'], "typeof order.status === 'string'"],
    ['instanceof', ['unsupported-syntax'], 'order instanceof Object'],
    ['a nullish default', ['unsupported-syntax'], "(order.note ?? 'x') === 'x'"],
  ])('forks on %s only with an unknown-guard reason', (_name, extra, test) => {
    const body = `if (${test}) { bus.publish('OrderPaid', order.id); }`;

    expect(outline(analyzedText(snippet(body)))).toEqual({
      status: 'partial',
      reasons: ['unknown-guard', ...extra].sort(),
      violations: [`${PAID_A} possible`],
    });
  });

  it.each([
    ['a global', 'export function payOrder(order, bus) {\n  db.commit(order, "paid");\n}\n'],
    [
      'an undeclared parameter',
      'export function payOrder(order, ledger) {\n  ledger.commit(order, "paid");\n}\n',
    ],
    [
      'an object input',
      'export function payOrder(order, items) {\n  items.commit(order, "paid");\n}\n',
    ],
  ])('does not treat %s named like a receiver as an effect receiver', (_name, text) => {
    const contracts = {
      ...ORDER_CONTRACTS,
      effects: {
        'ledger.commit': ORDER_CONTRACTS.effects['db.commit'],
        'items.commit': ORDER_CONTRACTS.effects['db.commit'],
        ...ORDER_CONTRACTS.effects,
      },
    };

    expect(outline(analyzedText(text, contracts))).toEqual({
      status: 'partial',
      reasons: ['unknown-call'],
      violations: [],
    });
  });

  it('matches an imported effect on its module specifier and its name', () => {
    const contracts = {
      ...ORDER_CONTRACTS,
      effects: { ...ORDER_CONTRACTS.effects, './db#commit': ORDER_CONTRACTS.effects['db.commit'] },
    };
    function analyzedImport(module) {
      const text = `import { commit } from '${module}';\n${snippet("commit(order, 'paid');")}`;
      return outline(analyzedText(text, contracts));
    }

    expect([analyzedImport('./db'), analyzedImport('./other')]).toEqual([
      { status: 'complete', reasons: [], violations: [] },
      { status: 'partial', reasons: ['unknown-call'], violations: [] },
    ]);
  });

  it('treats an async same-file helper as unmodelled code that may run any effect', () => {
    const text = code`
      async function settle(order, db) {
        db.commit(order, 'paid');
      }
      export function payOrder(order, db, bus) {
        if (order.status !== 'pending') {
          return 'skipped';
        }
        settle(order, db);
        bus.publish('OrderPaid', order.id);
      }
    `;

    expect(outline(analyzedText(text))).toEqual({
      status: 'partial',
      reasons: ['async', 'unknown-entity'],
      violations: [
        'paid-before-publish|bus.publish|? possible',
        'order-status|db.commit|?|?|? possible',
        'paid-before-publish|bus.publish|? possible',
      ],
    });
  });

  it('keeps call-site identities when only whitespace changes', () => {
    const fixture = fixtureNamed('duplicate-publish-sites');
    const spaced = fixture.source.replaceAll('\n', '\n\n');
    function sites(text) {
      return analyzedText(text).violations.map((item) => [item.signature, item.line]);
    }

    expect([sites(fixture.source), sites(spaced)]).toEqual([
      [
        [`${PAID_A}@payOrder:bus.publish#1`, 6],
        [`${PAID_A}@payOrder:bus.publish#2`, 8],
      ],
      [
        [`${PAID_A}@payOrder:bus.publish#1`, 11],
        [`${PAID_A}@payOrder:bus.publish#2`, 15],
      ],
    ]);
  });
});

describe('bounds', () => {
  it('reports an exhausted state budget as partial, and completes with a larger budget', () => {
    const small = analyzed('exhausted-budget');
    const large = analyzed('exhausted-budget', { maxStates: 64 });

    expect([small.reasons, small.stats.states <= 6, large.status]).toEqual([
      [{ reason: 'state-budget', line: 0, column: 0, detail: '6' }],
      true,
      'complete',
    ]);
  });

  it('stops at the call-depth bound instead of inlining further', () => {
    const text = code`
      function third(order, db) {
        db.commit(order, 'paid');
      }
      function second(order, db) {
        third(order, db);
      }
      export function payOrder(order, db) {
        second(order, db);
      }
    `;
    const options = { file: 'depth.ts', text, entry: 'payOrder', contracts: ORDER_CONTRACTS };
    function reasonsAt(maxDepth) {
      const { result } = analyzeSource({ ...options, inputs: ORDER_INPUTS, bounds: { maxDepth } });
      return outline(result).reasons;
    }

    expect([reasonsAt(2), reasonsAt(3)]).toEqual([['call-depth'], []]);
  });
});
