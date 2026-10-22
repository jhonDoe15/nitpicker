import { describe, expect, it } from 'vitest';
import { analyzeSource } from '../analyze.mjs';
import { demonstrationDiffs, evaluateFixtures, evaluateLookup } from '../evaluate.mjs';
import { ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from '../fixtures/index.mjs';
import { applyEdits, code } from '../fixtures/source.mjs';
import { cacheKey, flowDiff, semanticHash } from './diff.mjs';
import { findingsFor, parsedFindings } from './findings.mjs';
import { decisionTable, flowView, pathTable } from './view.mjs';

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

describe('semantic hashes and cache keys', () => {
  it('keep the same hash and key across whitespace changes while locations are refreshed', () => {
    const spaced = BASE.replaceAll('\n', '\n\n');
    const [base, head] = [analysisOf(BASE), analysisOf(spaced)];

    expect(semanticHash(head.model.functions.payOrder)).toBe(
      semanticHash(base.model.functions.payOrder),
    );
    expect(keyOf(spaced)).toBe(keyOf(BASE));
    expect(head.result.paths.at(-1).events.at(-1).line).not.toBe(
      base.result.paths.at(-1).events.at(-1).line,
    );
  });

  it('change the key for a helper body, contracts, inputs, bounds or analyzer version', () => {
    const base = keyOf(BASE);
    const helperChanged = keyOf(
      applyEdits(BASE, [["db.commit(order, 'paid');", "db.commit(order, 'cancelled');"]]),
    );
    const contracts = { ...ORDER_CONTRACTS, pure: [] };
    const { model } = analysisOf(BASE);

    expect(helperChanged).not.toBe(base);
    expect(keyOf(BASE, { contracts })).not.toBe(base);
    expect(keyOf(BASE, { inputs: { ...ORDER_INPUTS, order: { id: 'C' } } })).not.toBe(base);
    expect(keyOf(BASE, { bounds: { maxStates: 8 } })).not.toBe(base);
    expect(cacheKey({ model, ...OPTIONS, version: 'flow-model-next' })).not.toBe(base);
  });

  it('keep the key when only a function outside the entry closure changes', () => {
    expect(keyOf(applyEdits(BASE, [['return 1;', 'return 2;']]))).toBe(keyOf(BASE));
  });
});

describe('flowDiff', () => {
  it('shows the changed guard and effect of the demonstration head with their new violations', () => {
    const { fixture } = demonstrationDiffs(evaluateLookup());

    expect(fixture.removed.map((item) => `${item.kind} ${item.text}`)).toEqual([
      'guard order.status !== "pending"',
      'effect db.commit(order, "paid")',
    ]);
    expect(fixture.added.map((item) => `${item.kind} ${item.text} ${String(item.line)}`)).toEqual([
      'guard order.status === "cancelled" 2',
      'effect db.commit(order, "refunded") 5',
    ]);
    expect(fixture.violations.added).toEqual([
      'order-status|db.commit|A|pending|refunded',
      'paid-before-publish|bus.publish|A',
    ]);
    expect(fixture.keys.base).not.toBe(fixture.keys.head);
  });

  it('shows an inverted guard in the real lookup as a changed guard and swapped outcomes', () => {
    const { lookup } = demonstrationDiffs(evaluateLookup());

    expect(lookup.added.filter((item) => item.kind === 'guard').map((item) => item.text)).toEqual([
      'report !== undefined',
    ]);
    expect(lookup.violations).toEqual({ added: [], removed: [] });
    expect(lookup.outcomes.added).toContain(
      'resolveAnalyzerMetadata:resolved > cache.read:miss => return { kind: hit, report: undefined }',
    );
  });

  it('reports no change for a whitespace-only edit', () => {
    const diff = flowDiff(analysisOf(BASE), analysisOf(BASE.replaceAll('  ', '    ')));

    expect(diff).toMatchObject({ changedFunctions: [], added: [], removed: [] });
  });
});

describe('findings and views', () => {
  it('produces descriptive findings that the existing finding parser accepts unchanged', () => {
    const findings = [...evaluateFixtures(), ...evaluateLookup().variants].flatMap(
      (target) => target.findings,
    );

    expect(parsedFindings(findings)).toEqual(findings);
    expect(new Set(findings.map((finding) => finding.classification))).toEqual(
      new Set(['descriptive']),
    );
  });

  it('reports every incomplete reason as its own finding', () => {
    const fixture = fixtureNamed('unknown-recovery');
    const { result } = analyzeSource({
      file: fixture.file,
      text: fixture.source,
      entry: fixture.entry,
      ...OPTIONS,
    });
    const rules = findingsFor({ file: fixture.file, entry: fixture.entry }, result).map(
      (finding) => finding.rule,
    );

    expect(rules).toEqual(['flow-model/paths', 'flow-model/prerequisite', 'flow-model/incomplete']);
  });

  it('renders the decision and path tables from the same model and result', () => {
    const analysis = analysisOf(BASE);

    expect(decisionTable(analysis.model).split('\n')).toHaveLength(2 + 4);
    expect(pathTable(analysis.result).split('\n')).toHaveLength(2 + analysis.result.paths.length);
    expect(flowView({ name: 'keys', ...analysis })).toContain('**complete**');
  });
});
