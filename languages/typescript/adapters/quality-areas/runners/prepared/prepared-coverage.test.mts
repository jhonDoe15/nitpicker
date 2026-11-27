import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scratchTrees } from '../../../../../../shared/test-support/scratch-trees.mts';
import { testOptions } from '../../../test-runners/typed/test-options.mts';
import { COVERAGE_REPORT_PATH } from '../../reporting/test-report.mts';
import { runCoverage, runCrap } from '../tests.mts';

const projectRun = vi.hoisted(() => ({ calls: 0 }));

vi.mock('../../../test-runners/run-project-tests.mts', () => ({
  runProjectTests: () => {
    projectRun.calls += 1;
    return Promise.resolve({ failed: false, report: { numTotalTests: 0 }, runnerName: 'Vitest' });
  },
}));

const tree = scratchTrees('prepared-coverage-');
const output = { write: () => true };

const PROJECT = {
  'package.json': '{"name":"app","private":true}',
  'src/a.ts': 'export const a = 1;\n',
  'src/a.test.ts': "import { it } from 'vitest';\nit('runs', () => {});\n",
};

function optionsFor(snapshot: 'base' | 'head', preparedTestResults: string | undefined) {
  const project = tree(PROJECT);
  return testOptions({
    projectRoot: project,
    liveProjectRoot: project,
    snapshot,
    preparedTestResults,
  });
}

function recorded(report: object): string {
  return tree({
    'results/test-report.json': JSON.stringify({ ...report, testResults: [] }),
    'results/coverage-final.json': '{}',
  });
}

afterEach(() => {
  projectRun.calls = 0;
});

describe('coverage from test results recorded before the run', () => {
  it('reports the base tests as not run', async () => {
    const findings = await runCoverage(optionsFor('base', recorded({ numTotalTests: 1 })), output);

    expect(findings.map(({ rule }) => rule)).toEqual(['tests-not-run-on-base']);
    expect(projectRun.calls).toBe(0);
  });

  it('reports recorded results with no tests as no tests run', async () => {
    const options = optionsFor('head', path.join(recorded({}), 'results'));
    const findings = await runCoverage(options, output);

    expect(findings.map(({ rule }) => rule)).toEqual(['tests-not-run']);
    expect(existsSync(path.join(options.projectRoot, COVERAGE_REPORT_PATH))).toBe(false);
  });

  it('reads the coverage of recorded passing tests', async () => {
    const options = optionsFor('head', path.join(recorded({ numTotalTests: 1 }), 'results'));
    const findings = await runCoverage(options, output);

    expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
    expect(projectRun.calls).toBe(0);
  });

  it('runs the project tests when no results are recorded', async () => {
    const findings = await runCoverage(optionsFor('head', ''), output);

    expect(findings.map(({ rule }) => rule)).toEqual(['tests-not-run']);
    expect(projectRun.calls).toBe(1);
  });
});

describe('CRAP without a coverage report', () => {
  it.each([
    ['base', 'results', 'because the base tests were not run'],
    ['base', '', 'because the project tests fail'],
    ['base', undefined, 'because the project tests fail'],
    ['head', 'results', 'because the project tests fail'],
  ] as const)(
    'explains the skip for the %s snapshot with results %j',
    (snapshot, prepared, reason) => {
      const findings = runCrap(optionsFor(snapshot, prepared));

      expect(findings.map(({ rule, message }) => [rule, message])).toEqual([
        ['tests-failed-skipped', expect.stringContaining(reason)],
      ]);
    },
  );
});
