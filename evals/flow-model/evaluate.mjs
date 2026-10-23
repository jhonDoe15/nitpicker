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

function labelMatches(result, expect) {
  const violations = result.violations.map((violation) => violation.observation).sort();
  const reasons = sortedUnique(result.reasons.map((reason) => reason.reason));
  return (
    result.status === expect.status &&
    canonicalJson(violations) === canonicalJson([...expect.violations].sort()) &&
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

function evaluateTarget(target, { contracts, inputs }) {
  const options = {
    file: target.file,
    text: target.text,
    entry: target.entry,
    contracts,
    inputs,
    bounds: target.bounds,
  };
  const analysis = analyzeSource(options);
  const exploreUnknown = analysis.result.status === 'partial';
  const oracle = runOracle({ ...options, exploreUnknown });
  const comparison = compareWithOracle(analysis.result, oracle);
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
      { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS },
    ),
  );
}

export function evaluateLookup(root = REPOSITORY_ROOT) {
  const source = readLookupSource(root);
  const variants = lookupVariants(source.text).map((variant) =>
    evaluateTarget(variant, { contracts: LOOKUP_CONTRACTS, inputs: LOOKUP_INPUTS }),
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

export function demonstrationDiffs(variants) {
  const base = fixtureNamed('correct-ordering');
  const baseTarget = { file: base.file, entry: base.entry, text: base.source };
  const headTarget = {
    ...baseTarget,
    file: 'reports/flow-model/fixtures/correct-ordering.head.ts',
    text: applyEdits(base.source, HEAD_EDITS),
  };
  const unchanged = variants.find((variant) => variant.kind === 'unchanged');
  const inverted = variants.find((variant) => variant.kind === 'diff');
  return {
    fixture: diffOf(baseTarget, headTarget, { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS }),
    lookup: diffOf(unchanged, inverted, { contracts: LOOKUP_CONTRACTS, inputs: LOOKUP_INPUTS }),
  };
}

const SIZE_FIELDS = [
  ['fileBytes', 'fileBytes'],
  ['sourceBytes', 'sourceBytes'],
  ['modelBytes', 'modelBytes'],
  ['viewBytes', 'viewBytes'],
  ['resultBytes', 'resultBytes'],
  ['modeledStatements', 'modeled'],
  ['unsupportedStatements', 'unsupported'],
];

function sumOf(items, pick) {
  return items.reduce((total, item) => total + pick(item), 0);
}

function countOf(items, test) {
  return items.filter(test).length;
}

function totals(targets) {
  return Object.fromEntries(
    SIZE_FIELDS.map(([name, field]) => [name, sumOf(targets, (target) => target.sizes[field])]),
  );
}

function oracleTotals(targets) {
  const modes = {
    unsupported: countOf(targets, (target) => target.comparison.mode === 'unsupported'),
  };
  for (const mode of ['exact', 'subset']) {
    const compared = targets.filter((target) => target.comparison.mode === mode);
    modes[mode] = {
      targets: compared.length,
      executions: sumOf(compared, (target) => target.comparison.executions),
      disagreements: countOf(compared, (target) => !target.comparison.agree),
    };
  }
  return modes;
}

function fixtureSummary(fixtures) {
  return {
    total: fixtures.length,
    complete: countOf(fixtures, (item) => item.result.status === 'complete'),
    partial: countOf(fixtures, (item) => item.result.status === 'partial'),
    labelMismatches: countOf(fixtures, (item) => !item.labelMatch),
    withViolations: countOf(fixtures, (item) => item.result.violations.length > 0),
    violations: sumOf(fixtures, (item) => item.result.violations.length),
    oracle: oracleTotals(fixtures),
    sizes: totals(fixtures),
  };
}

function lookupSummary(lookup) {
  const { variants } = lookup;
  return {
    fileSha256: lookup.fileSha256,
    entrySha256: lookup.entrySha256,
    variants: variants.length,
    labelMismatches: countOf(variants, (item) => !item.labelMatch),
    seededDetected: countOf(
      variants,
      (item) => item.kind === 'seeded' && item.result.violations.length > 0,
    ),
    seeded: countOf(variants, (item) => item.kind === 'seeded'),
    unsupportedPartial: countOf(
      variants,
      (item) => item.kind === 'unsupported' && item.result.status === 'partial',
    ),
    oracle: oracleTotals(variants),
    sizes: totals(variants),
  };
}

export function summarize(fixtures, lookup) {
  return { fixtures: fixtureSummary(fixtures), lookup: lookupSummary(lookup) };
}
