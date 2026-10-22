import { analyzeSource } from './analyze.mjs';
import { functionSourceBytes } from './extract/extract.mjs';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from './fixtures/index.mjs';
import { applyEdits } from './fixtures/source.mjs';
import { compareWithOracle } from './oracle/compare.mjs';
import { runOracle } from './oracle/oracle.mjs';
import {
  LOOKUP_CONTRACTS,
  LOOKUP_INPUTS,
  lookupVariants,
  readLookupSource,
} from './real/lookup.mjs';
import { canonicalJson } from './report/canonical.mjs';
import { cacheKey, flowDiff } from './report/diff.mjs';
import { findingsFor } from './report/findings.mjs';
import { statementCounts } from './report/items.mjs';
import { flowView } from './report/view.mjs';

export const REPOSITORY_ROOT = new URL('../../', import.meta.url);

const HEAD_EDITS = [
  ["order.status !== 'pending'", "order.status === 'cancelled'"],
  ["db.commit(order, 'paid')", "db.commit(order, 'refunded')"],
];

function sortedUnique(items) {
  return [...new Set(items)].sort();
}

export function labelMatches(result, expect) {
  const violations = sortedUnique(result.violations.map((violation) => violation.signature));
  const reasons = sortedUnique(result.reasons.map((reason) => reason.reason));
  return (
    result.status === expect.status &&
    canonicalJson(violations) === canonicalJson(sortedUnique(expect.violations)) &&
    canonicalJson(reasons) === canonicalJson(sortedUnique(expect.reasons))
  );
}

function measure(target, analysis) {
  const view = flowView({ name: target.name, ...analysis });
  return {
    fileBytes: Buffer.byteLength(target.text),
    sourceBytes: functionSourceBytes(target, Object.keys(analysis.model.functions)),
    modelBytes: Buffer.byteLength(canonicalJson(analysis.model)),
    viewBytes: Buffer.byteLength(view),
    resultBytes: Buffer.byteLength(canonicalJson(analysis.result)),
    ...statementCounts(analysis.model),
  };
}

export function evaluateTarget(target, { contracts, inputs, oracle }) {
  const options = {
    file: target.file,
    text: target.text,
    entry: target.entry,
    contracts,
    inputs,
    bounds: target.bounds,
  };
  const analysis = analyzeSource(options);
  const eligible = oracle && analysis.result.status === 'complete';
  const comparison = eligible ? compareWithOracle(analysis.result, runOracle(options)) : undefined;
  return {
    ...target,
    ...analysis,
    labelMatch: labelMatches(analysis.result, target.expect),
    comparison,
    sizes: measure(target, analysis),
    key: cacheKey({ model: analysis.model, contracts, inputs, bounds: target.bounds }),
    findings: findingsFor({ file: target.file, entry: target.entry }, analysis.result),
  };
}

export function evaluateFixtures() {
  return FIXTURES.map((fixture) =>
    evaluateTarget(
      { ...fixture, text: fixture.source },
      { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS, oracle: fixture.oracle },
    ),
  );
}

export function evaluateLookup(root = REPOSITORY_ROOT) {
  const source = readLookupSource(root);
  const variants = lookupVariants(source.text).map((variant) =>
    evaluateTarget(variant, {
      contracts: LOOKUP_CONTRACTS,
      inputs: LOOKUP_INPUTS,
      oracle: variant.kind !== 'unsupported',
    }),
  );
  return { fileSha256: source.fileSha256, entrySha256: source.entrySha256, variants };
}

function diffOf(base, head, { contracts, inputs }) {
  const options = { entry: base.entry, contracts, inputs };
  const baseAnalysis = analyzeSource({ ...options, file: base.file, text: base.text });
  const headAnalysis = analyzeSource({ ...options, file: head.file, text: head.text });
  return {
    base: base.file,
    head: head.file,
    ...flowDiff(baseAnalysis, headAnalysis),
    keys: {
      base: cacheKey({ model: baseAnalysis.model, contracts, inputs }),
      head: cacheKey({ model: headAnalysis.model, contracts, inputs }),
    },
  };
}

export function demonstrationDiffs(lookup) {
  const base = fixtureNamed('correct-ordering');
  const baseTarget = { file: base.file, entry: base.entry, text: base.source };
  const headTarget = {
    ...baseTarget,
    file: 'reports/flow-model/fixtures/correct-ordering.head.ts',
    text: applyEdits(base.source, HEAD_EDITS),
  };
  const unchanged = lookup.variants.find((variant) => variant.kind === 'unchanged');
  const inverted = lookup.variants.find((variant) => variant.kind === 'diff');
  return {
    fixture: diffOf(baseTarget, headTarget, { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS }),
    lookup: diffOf(unchanged, inverted, { contracts: LOOKUP_CONTRACTS, inputs: LOOKUP_INPUTS }),
  };
}

function totals(targets) {
  const sum = (pick) => targets.reduce((total, target) => total + pick(target), 0);
  return {
    fileBytes: sum((target) => target.sizes.fileBytes),
    sourceBytes: sum((target) => target.sizes.sourceBytes),
    modelBytes: sum((target) => target.sizes.modelBytes),
    viewBytes: sum((target) => target.sizes.viewBytes),
    resultBytes: sum((target) => target.sizes.resultBytes),
    modeledStatements: sum((target) => target.sizes.modeled),
    unsupportedStatements: sum((target) => target.sizes.unsupported),
  };
}

function oracleTotals(targets) {
  const compared = targets.filter((target) => target.comparison !== undefined);
  return {
    targets: compared.length,
    executions: compared.reduce((total, target) => total + target.comparison.executions, 0),
    mismatches: compared.filter((target) => !target.comparison.agree).length,
  };
}

export function summarize(fixtures, lookup) {
  const count = (items, test) => items.filter(test).length;
  return {
    fixtures: {
      total: fixtures.length,
      complete: count(fixtures, (item) => item.result.status === 'complete'),
      partial: count(fixtures, (item) => item.result.status === 'partial'),
      labelMismatches: count(fixtures, (item) => !item.labelMatch),
      withViolations: count(fixtures, (item) => item.result.violations.length > 0),
      violations: fixtures.reduce((total, item) => total + item.result.violations.length, 0),
      oracle: oracleTotals(fixtures),
      sizes: totals(fixtures),
    },
    lookup: {
      fileSha256: lookup.fileSha256,
      entrySha256: lookup.entrySha256,
      variants: lookup.variants.length,
      labelMismatches: count(lookup.variants, (item) => !item.labelMatch),
      seededDetected: count(
        lookup.variants,
        (item) => item.kind === 'seeded' && item.result.violations.length > 0,
      ),
      seeded: count(lookup.variants, (item) => item.kind === 'seeded'),
      unsupportedPartial: count(
        lookup.variants,
        (item) => item.kind === 'unsupported' && item.result.status === 'partial',
      ),
      oracle: oracleTotals(lookup.variants),
      sizes: totals(lookup.variants),
    },
  };
}
