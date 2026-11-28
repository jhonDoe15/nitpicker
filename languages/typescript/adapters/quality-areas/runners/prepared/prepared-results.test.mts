import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QualityAreaOptions } from '../../typed/area-types.mts';
import { preparedTestRun } from './prepared-results.mts';
import { scratchTrees } from '../../../../../../shared/test-support/scratch-trees.mts';

const tree = scratchTrees('prepared-results-');

const PASSING = { numTotalTests: 2, numFailedTests: 0, testResults: [] };

function optionsFor(snapshot: 'base' | 'head', roots: { live: string; project: string }) {
  const options: QualityAreaOptions = {
    analyzerName: 'coverage',
    kind: 'coverage',
    projectRoot: roots.project,
    projectPolicyRoot: roots.project,
    policyRoot: roots.project,
    toolRoot: roots.project,
    liveProjectRoot: roots.live,
    snapshot,
    legacyInventory: '',
    crapScoreLimit: 30,
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    mutationScope: undefined,
    environment: {},
  };
  return options;
}

function recorded(live: string, report: object = PASSING): Readonly<Record<string, string>> {
  const file = path.join(live, 'src', 'a.ts');
  return {
    'results/coverage-final.json': JSON.stringify({ [file]: { path: file, s: { 0: 1 } } }),
    'results/test-report.json': JSON.stringify({
      ...report,
      testResults: [{ name: path.join(live, 'src', 'a.test.ts') }],
    }),
  };
}

describe('test results prepared for the head', () => {
  it('moves the recorded paths from the live checkout into the head snapshot', () => {
    const live = tree({});
    const project = tree({});
    const results = tree(recorded(live));

    const run = preparedTestRun(optionsFor('head', { live, project }), results + '/results');
    const coverage: unknown = JSON.parse(
      readFileSync(path.join(project, 'reports/quality/coverage/coverage-final.json'), 'utf8'),
    );

    const file = path.join(project, 'src', 'a.ts');
    expect([run.report?.testResults, coverage]).toEqual([
      [{ name: path.join(project, 'src', 'a.test.ts') }],
      { [file]: { path: file, s: { 0: 1 } } },
    ]);
  });

  it('reads a relative folder from the live checkout', () => {
    const live = tree(recorded('/elsewhere'));
    const project = tree({});

    expect(preparedTestRun(optionsFor('head', { live, project }), 'results').report).toEqual({
      ...PASSING,
      testResults: [{ name: path.join('/elsewhere', 'src', 'a.test.ts') }],
    });
  });

  it('reports failing recorded tests as a tool error instead of reading their coverage', () => {
    const live = tree({});
    const project = tree({});
    const results = tree(recorded(live, { numTotalTests: 2, numFailedTests: 1 }));

    const run = preparedTestRun(
      optionsFor('head', { live, project }),
      path.join(results, 'results'),
    );

    expect(run.findings?.map(({ rule, classification }) => [rule, classification])).toEqual([
      ['tests-failed', 'tool-error'],
    ]);
  });

  it('marks the base tests as not run, so its test results count as unknown', () => {
    const live = tree({});

    const run = preparedTestRun(optionsFor('base', { live, project: live }), 'missing');

    expect(run.findings?.map(({ rule, path: findingPath }) => [rule, findingPath])).toEqual([
      ['tests-not-run-on-base', '.'],
    ]);
  });

  it('counts a report that says it did not succeed as failing', () => {
    const live = tree({});
    const results = tree(recorded(live, { numTotalTests: 2, success: false }));

    const run = preparedTestRun(
      optionsFor('head', { live, project: tree({}) }),
      path.join(results, 'results'),
    );

    expect(run.findings?.map(({ rule }) => rule)).toEqual(['tests-failed']);
  });

  it('refuses recorded results that are not a test report object or cannot be read', () => {
    const live = tree({});
    const options = optionsFor('head', { live, project: tree({}) });

    expect(() =>
      preparedTestRun(options, tree({ 'results/test-report.json': '5' }) + '/results'),
    ).toThrow('test-report.json is not a test report object');
    expect(() =>
      preparedTestRun(options, tree({ 'results/test-report.json': '{' }) + '/results'),
    ).toThrow('test-report.json cannot be read');
  });
});
