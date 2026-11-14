import { analyzeSource } from './analyze.mts';
import type { Bounds, Contracts, Expectation, Inputs } from './model/contract-types.mts';
import type { Analysis } from './model/run-types.mts';
import { functionSourceBytes } from './extract/extract.mts';
import { FIXTURES, ORDER_CONTRACTS, ORDER_INPUTS, fixtureNamed } from './fixtures/index.mts';
import { applyEdits } from './fixtures/source.mts';
import type { Edit } from './fixtures/source.mts';
import { compareWithOracle } from './oracle/compare.mts';
import type { Comparison } from './oracle/compare.mts';
import { runOracle } from './oracle/oracle.mts';
import {
  LOOKUP_CONTRACTS,
  LOOKUP_INPUTS,
  lookupVariants,
  readLookupSource,
} from './real/lookup.mts';
import type { Variant } from './real/lookup.mts';
import { canonicalJson } from './report/canonical.mts';
import { cacheKey, flowDiff } from './report/diff.mts';
import { findingsFor } from './report/findings.mts';
import type { Finding } from './report/findings.mts';
import { statementCounts } from './report/items.mts';
import { flowView } from './report/view.mts';

export const REPOSITORY_ROOT = new URL('../../', import.meta.url);

const HEAD_EDITS: readonly Edit[] = [
  ["order.status !== 'pending'", "order.status === 'cancelled'"],
  ["db.commit(order, 'paid')", "db.commit(order, 'refunded')"],
];

export type Target = {
  readonly name: string;
  readonly kind?: string;
  readonly file: string;
  readonly entry: string;
  readonly text: string;
  readonly bounds?: Partial<Bounds> | undefined;
  readonly expect: Expectation;
};

type Sizes = {
  readonly fileBytes: number;
  readonly sourceBytes: number;
  readonly modelBytes: number;
  readonly viewBytes: number;
  readonly resultBytes: number;
  readonly modeled: number;
  readonly unsupported: number;
};

export type Measured = Analysis & {
  readonly labelMatch: boolean;
  readonly comparison: Comparison;
  readonly sizes: Sizes;
  readonly key: string;
  readonly findings: readonly Finding[];
};

export type Evaluated = Target & Measured;

type Lookup = {
  readonly fileSha256: string;
  readonly entrySha256: string;
  readonly variants: (Variant & Measured)[];
};

type Setting = { readonly contracts: Contracts; readonly inputs: Inputs };

function sortedUnique(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

function labelMatches(result: Analysis['result'], expect: Expectation): boolean {
  const violations = result.violations.map((violation) => violation.observation).sort();
  const reasons = sortedUnique(result.reasons.map((reason) => reason.reason));
  return (
    result.status === expect.status &&
    canonicalJson(violations) === canonicalJson([...expect.violations].sort()) &&
    canonicalJson(reasons) === canonicalJson(sortedUnique(expect.reasons))
  );
}

function measure(target: Target, analysis: Analysis): Sizes {
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

function evaluateTarget<T extends Target>(target: T, { contracts, inputs }: Setting): T & Measured {
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

export function evaluateFixtures(): Evaluated[] {
  return FIXTURES.map((fixture) =>
    evaluateTarget(
      { ...fixture, text: fixture.source },
      { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS },
    ),
  );
}

export function evaluateLookup(root: URL = REPOSITORY_ROOT): Lookup {
  const source = readLookupSource(root);
  const variants = lookupVariants(source.text).map((variant) =>
    evaluateTarget(variant, { contracts: LOOKUP_CONTRACTS, inputs: LOOKUP_INPUTS }),
  );
  return { fileSha256: source.fileSha256, entrySha256: source.entrySha256, variants };
}

function diffOf(
  base: Pick<Target, 'file' | 'entry' | 'text'>,
  head: Pick<Target, 'file' | 'text'>,
  { contracts, inputs }: Setting,
) {
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

function variantOfKind(variants: readonly Variant[], kind: Variant['kind']): Variant {
  const found = variants.find((variant) => variant.kind === kind);
  if (found === undefined) {
    throw new Error(`flow-model: no ${kind} variant to compare`);
  }
  return found;
}

export function demonstrationDiffs(variants: readonly Variant[]) {
  const base = fixtureNamed('correct-ordering');
  const baseTarget = { file: base.file, entry: base.entry, text: base.source };
  const headTarget = {
    ...baseTarget,
    file: 'reports/flow-model/fixtures/correct-ordering.head.ts',
    text: applyEdits(base.source, HEAD_EDITS),
  };
  const unchanged = variantOfKind(variants, 'unchanged');
  const inverted = variantOfKind(variants, 'diff');
  return {
    fixture: diffOf(baseTarget, headTarget, { contracts: ORDER_CONTRACTS, inputs: ORDER_INPUTS }),
    lookup: diffOf(unchanged, inverted, { contracts: LOOKUP_CONTRACTS, inputs: LOOKUP_INPUTS }),
  };
}

const SIZE_FIELDS: readonly (readonly [string, keyof Sizes])[] = [
  ['fileBytes', 'fileBytes'],
  ['sourceBytes', 'sourceBytes'],
  ['modelBytes', 'modelBytes'],
  ['viewBytes', 'viewBytes'],
  ['resultBytes', 'resultBytes'],
  ['modeledStatements', 'modeled'],
  ['unsupportedStatements', 'unsupported'],
];

function sumOf<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function countOf<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.filter(test).length;
}

function totals(targets: readonly Evaluated[]): Record<string, number> {
  return Object.fromEntries(
    SIZE_FIELDS.map(([name, field]) => [name, sumOf(targets, (target) => target.sizes[field])]),
  );
}

function modeTotals(targets: readonly Evaluated[], mode: 'exact' | 'subset') {
  const compared = targets.filter((target) => target.comparison.mode === mode);
  return {
    targets: compared.length,
    executions: sumOf(compared, (target) => target.comparison.executions),
    disagreements: countOf(compared, (target) => !target.comparison.agree),
  };
}

function oracleTotals(targets: readonly Evaluated[]) {
  return {
    unsupported: countOf(targets, (target) => target.comparison.mode === 'unsupported'),
    exact: modeTotals(targets, 'exact'),
    subset: modeTotals(targets, 'subset'),
  };
}

function fixtureSummary(fixtures: readonly Evaluated[]) {
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

function lookupSummary(lookup: Lookup) {
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

export function summarize(fixtures: readonly Evaluated[], lookup: Lookup) {
  return { fixtures: fixtureSummary(fixtures), lookup: lookupSummary(lookup) };
}
