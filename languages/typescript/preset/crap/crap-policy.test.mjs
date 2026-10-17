import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import crapConfig from '../defaults/crap.config.mjs';
import { measureCrap } from './measure.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixtures = path.join(projectRoot, 'languages/typescript/preset/crap/fixtures');
const TYPESCRIPT_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts'];

function measure(source, coverage) {
  return measureCrap(projectRoot, [path.join(fixtures, source)], {
    extensions: TYPESCRIPT_EXTENSIONS,
    excludes: crapConfig.excludes,
    coverageReportPath: path.join(fixtures, coverage),
  });
}

let metricsByName;

beforeAll(() => {
  metricsByName = new Map(
    measure('functions.ts', 'coverage-final.json').metrics.map((metric) => [
      metric.displayName,
      metric,
    ]),
  );
});

function metric(name) {
  const result = metricsByName.get(name);
  expect(result, `missing CRAP fixture function ${name}`).toBeDefined();
  return result;
}

describe('function-level CRAP policy', () => {
  it('scores a simple covered function', () => {
    const result = metric('simpleCovered');

    expect([
      result.complexity,
      result.statementCoverage,
      result.branchCoverage,
      result.coverage,
      result.crapScore,
    ]).toEqual([
      1,
      { percent: 100, status: 'measured', unknownReason: undefined },
      { percent: undefined, status: 'structural_na', unknownReason: undefined },
      { percent: 100, status: 'measured', unknownReason: undefined },
      1,
    ]);
  });

  it('scores a complex covered function', () => {
    const result = metric('complexCovered');

    expect([
      result.complexity,
      result.statementCoverage.percent,
      result.branchCoverage.percent,
    ]).toEqual([3, 100, 100]);
    expect(result.crapScore).toBe(3);
  });

  it('weights an uncovered complex function', () => {
    const result = metric('complexUncovered');

    expect([
      result.complexity,
      result.statementCoverage.percent,
      result.branchCoverage.percent,
    ]).toEqual([3, 0, 0]);
    expect(result.crapScore).toBe(12);
  });

  it('reports unknown coverage without scoring it as zero', () => {
    const result = metric('unknownCoverage');

    expect(result.coverage).toEqual({
      percent: undefined,
      status: 'unknown',
      unknownReason: 'statement_unattributed',
    });
    expect(result.crapScore).toBeUndefined();
  });
});

describe('coverage of an arrow whose callback shares its lines', () => {
  it('is measured from the function bodies when the function map cannot pick between two entries', () => {
    const analysis = measure('nested-callback.ts', 'coverage-nested-callback.json');
    const byName = new Map(analysis.metrics.map((entry) => [entry.displayName, entry]));

    expect([
      byName.get('sleep').statementCoverage.percent,
      byName.get('sleep').crapScore,
      byName.get('find').crapScore,
    ]).toEqual([0, 2, 1]);
    expect(analysis.metrics.filter((entry) => entry.crapScore === undefined)).toEqual([]);
  });
});
