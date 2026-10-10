import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject } from '@barney-media/crap-typescript-core';
import { beforeAll, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixtureSource = path.join(
  projectRoot,
  'languages/typescript/preset/crap/fixtures/functions.ts',
);
const fixtureCoverage = path.join(
  projectRoot,
  'languages/typescript/preset/crap/fixtures/coverage-final.json',
);
let metricsByName;

beforeAll(async () => {
  const analysis = await analyzeProject({
    projectRoot: projectRoot,
    explicitPaths: [fixtureSource],
    coverageMode: 'existing-only',
    coverageReportPath: fixtureCoverage,
    useDefaultExclusions: false,
  });
  metricsByName = new Map(analysis.metrics.map((metric) => [metric.displayName, metric]));
});

function metric(name) {
  const result = metricsByName.get(name);
  expect(result, `missing CRAP fixture function ${name}`).toBeDefined();
  return result;
}

describe('function-level CRAP policy', () => {
  it('scores a simple covered function', () => {
    const result = metric('simpleCovered');

    expect(result.complexity).toBe(1);
    expect(result.statementCoverage.percent).toBe(100);
    expect(result.branchCoverage.status).toBe('structural_na');
    expect(result.crapScore).toBe(1);
  });

  it('scores a complex covered function', () => {
    const result = metric('complexCovered');

    expect(result.complexity).toBe(3);
    expect(result.statementCoverage.percent).toBe(100);
    expect(result.branchCoverage.percent).toBe(100);
    expect(result.crapScore).toBe(3);
  });

  it('weights an uncovered complex function', () => {
    const result = metric('complexUncovered');

    expect(result.complexity).toBe(3);
    expect(result.statementCoverage.percent).toBe(0);
    expect(result.branchCoverage.percent).toBe(0);
    expect(result.crapScore).toBe(12);
  });

  it('reports unknown coverage without scoring it as zero', () => {
    const result = metric('unknownCoverage');

    expect(result.coverage.status).toBe('unknown');
    expect(result.coverage.percent).toBeNull();
    expect(result.crapScore).toBeNull();
  });
});
