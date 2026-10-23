import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mjs';
import { REPOSITORY_ROOT, demonstrationDiffs } from '../evaluate.mjs';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mjs';
import { applyEdits, code } from '../fixtures/source.mjs';
import {
  LOOKUP_CONTRACTS,
  LOOKUP_INPUTS,
  lookupVariants,
  readLookupSource,
} from '../real/lookup.mjs';
import { cacheKey, flowDiff, semanticHash } from './diff.mjs';
import { findingsFor, parsedFindings } from './findings.mjs';
import { decisionTable, pathTable } from './view.mjs';

const OPTIONS = { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS };
const BASE = code`
  function settle(order, db) {
    db.commit(order, 'paid');
  }
  function unrelated() {
    return 1;
  }
  export function payOrder(order, db, bus) {
    if (order.status !== 'pending') {
      return 'skipped';
    }
    settle(order, db);
    bus.publish('OrderPaid', order.id);
  }
`;

function analysisOf(text, options = {}) {
  return analyzeSource({ file: 'keys.ts', text, entry: 'payOrder', ...OPTIONS, ...options });
}

function keyOf(text, options = {}) {
  const { model } = analysisOf(text, options);
  return cacheKey({ model, ...OPTIONS, ...options });
}

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

describe('semantic hashes and cache keys', () => {
  it('keep semantic hashes across whitespace changes but key the refreshed anchors', () => {
    const spaced = BASE.replaceAll('\n', '\n\n');
    const [base, head] = [analysisOf(BASE), analysisOf(spaced)];
    function lastLine(analysis) {
      return analysis.result.paths.at(-1).events.at(-1).line;
    }

    expect([
      semanticHash(head.model.functions.payOrder) === semanticHash(base.model.functions.payOrder),
      keyOf(spaced) === keyOf(BASE),
      [lastLine(base), lastLine(head)],
    ]).toEqual([true, false, [12, 23]]);
  });

  it('give the same key only to analyses with the same anchors', () => {
    const [first, second] = [analysisOf(BASE), analysisOf(`${BASE}\n`)];

    expect([keyOf(`${BASE}\n`) === keyOf(BASE), second.result]).toEqual([true, first.result]);
  });

  it('change the key for a helper body, file, contracts, inputs, bounds or analyzer version', () => {
    const helperChanged = applyEdits(BASE, [
      ["db.commit(order, 'paid');", "db.commit(order, 'cancelled');"],
    ]);
    const { model } = analysisOf(BASE);
    const keys = [
      keyOf(BASE),
      keyOf(helperChanged),
      keyOf(BASE, { file: 'moved.ts' }),
      keyOf(BASE, { contracts: { ...ORDER_CONTRACTS, constructs: [] } }),
      keyOf(BASE, { inputs: { ...ORDER_INPUTS, order: { id: 'C' } } }),
      keyOf(BASE, { bounds: { maxStates: 8 } }),
      cacheKey({ model, ...OPTIONS, version: 'flow-model-next' }),
    ];

    expect(new Set(keys).size).toEqual(keys.length);
  });

  it('keep the key when only a function outside the entry closure changes', () => {
    expect(keyOf(applyEdits(BASE, [['return 1;', 'return 2;']]))).toEqual(keyOf(BASE));
  });
});

describe('flowDiff', () => {
  let diffs;

  beforeAll(() => {
    diffs = demonstrationDiffs(lookupVariants(readLookupSource(REPOSITORY_ROOT).text));
  });

  it('shows the changed guard and effect of the demonstration head with their new violations', () => {
    const { fixture } = diffs;

    expect(pick(fixture, ['removed', 'added', 'violations'])).toEqual({
      removed: [
        { fn: 'payOrder', kind: 'guard', text: 'order.status !== "pending"', line: 2, column: 7 },
        { fn: 'payOrder', kind: 'effect', text: 'db.commit(order, "paid")', line: 5, column: 3 },
      ],
      added: [
        { fn: 'payOrder', kind: 'guard', text: 'order.status === "cancelled"', line: 2, column: 7 },
        {
          fn: 'payOrder',
          kind: 'effect',
          text: 'db.commit(order, "refunded")',
          line: 5,
          column: 3,
        },
      ],
      violations: {
        removed: [],
        added: [
          'order-status|db.commit|A|pending|refunded@payOrder:db.commit#1',
          'paid-before-publish|bus.publish|A@payOrder:bus.publish#1',
        ],
      },
    });
  });

  it('shows an inverted guard in the real lookup as a changed guard and swapped outcomes', () => {
    const { lookup } = diffs;
    const resolved = '../execution/run-analyzers.mjs#resolveAnalyzerMetadata:resolved';

    expect(pick(lookup, ['changedFunctions', 'violations', 'outcomes'])).toEqual({
      changedFunctions: ['lookUpCachedReport'],
      violations: { added: [], removed: [] },
      outcomes: {
        removed: [
          `${resolved} > cache.read:hit => return { kind: hit, report: cache.read#2 }`,
          `${resolved} > cache.read:miss => return { kind: miss }`,
        ],
        added: [
          `${resolved} > cache.read:hit => return { kind: miss }`,
          `${resolved} > cache.read:miss => return { kind: hit, report: undefined }`,
        ],
      },
    });
  });

  it('renders enum members with their literal values', () => {
    const fixture = fixtureNamed('enum-guard');
    const options = { file: fixture.file, entry: fixture.entry, ...OPTIONS };
    const edits = [['db.commit(order, OrderStatus.Paid)', "db.commit(order, 'paid')"]];
    const base = analyzeSource({ ...options, text: fixture.source });
    const head = analyzeSource({ ...options, text: applyEdits(fixture.source, edits) });

    expect(pick(flowDiff(base, head), ['removed', 'added'])).toEqual({
      removed: [
        {
          fn: 'payOrder',
          kind: 'effect',
          text: 'db.commit(order, OrderStatus.Paid ("paid"))',
          line: 8,
          column: 5,
        },
      ],
      added: [
        { fn: 'payOrder', kind: 'effect', text: 'db.commit(order, "paid")', line: 8, column: 5 },
      ],
    });
  });

  it('reports no change for a whitespace-only edit', () => {
    const diff = flowDiff(analysisOf(BASE), analysisOf(BASE.replaceAll('  ', '    ')));

    expect(pick(diff, ['changedFunctions', 'added', 'removed', 'violations'])).toEqual({
      changedFunctions: [],
      added: [],
      removed: [],
      violations: { added: [], removed: [] },
    });
  });
});

describe('findings and views', () => {
  it('produces descriptive findings that the existing finding parser accepts unchanged', () => {
    const fixtures = FIXTURES.map((fixture) => ({ ...fixture, text: fixture.source, ...OPTIONS }));
    const variants = lookupVariants(readLookupSource(REPOSITORY_ROOT).text).map((variant) => ({
      ...variant,
      contracts: LOOKUP_CONTRACTS,
      inputs: LOOKUP_INPUTS,
    }));
    const findings = [...fixtures, ...variants].flatMap((target) =>
      findingsFor(target, analyzeSource(target).result),
    );

    expect([
      parsedFindings(findings),
      [...new Set(findings.map((finding) => finding.classification))],
      new Set(findings.map((finding) => finding.identity)).size,
    ]).toEqual([findings, ['descriptive'], findings.length]);
  });

  it('reports each of several incomplete reasons as its own finding with its own identity', () => {
    const fixture = fixtureNamed('update-and-delete');
    const target = { file: fixture.file, entry: fixture.entry };
    const { result } = analyzeSource({ ...target, text: fixture.source, ...OPTIONS });
    const findings = findingsFor(target, result);

    expect([
      findings.map((finding) => [finding.rule, finding.location]),
      new Set(findings.map((finding) => finding.identity)).size,
    ]).toEqual([
      [
        ['flow-model/paths', undefined],
        ['flow-model/prerequisite', { line: 6, column: 5 }],
        ['flow-model/incomplete', { line: 3, column: 3 }],
        ['flow-model/incomplete', { line: 4, column: 3 }],
        ['flow-model/incomplete', { line: 5, column: 7 }],
        ['flow-model/incomplete', { line: 5, column: 25 }],
        ['flow-model/incomplete', { line: 6, column: 5 }],
      ],
      7,
    ]);
  });

  it('renders the decision and path tables from the same model and result', () => {
    const analysis = analysisOf(BASE);
    const guard = 'order.status !== "pending"';
    const prefix = `${guard} is false (8:7); db.commit(A to paid)`;
    const success = `${prefix} success (2:3); bus.publish(A)`;

    expect([
      decisionTable(analysis.model).split('\n'),
      pathTable(analysis.result).split('\n'),
    ]).toEqual([
      [
        '| Function | Line:Col | Kind | Decision or effect |',
        '| --- | --- | --- | --- |',
        `| payOrder | 8:7 | guard | ${guard} |`,
        '| payOrder | 11:3 | effect | settle(order, db) |',
        '| payOrder | 12:3 | effect | bus.publish("OrderPaid", order.id) |',
        '| settle | 2:3 | effect | db.commit(order, "paid") |',
      ],
      [
        '| Path | Steps | Completion | Violations |',
        '| --- | --- | --- | --- |',
        `| p1 | ${guard} is true (8:7) | return skipped | - |`,
        `| p2 | ${prefix} failure (2:3) | throw error:db.commit#1 | - |`,
        `| p3 | ${prefix} ambiguous (2:3) | throw error:db.commit#1 | - |`,
        `| p4 | ${success} failure (12:3) | throw error:bus.publish#2 | - |`,
        `| p5 | ${success} success (12:3) | return undefined | - |`,
      ],
    ]);
  });
});
