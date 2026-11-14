import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { runQualitySnapshot } from './run-snapshot.mts';

const { temporaryRoot } = useGitFixtures();
const NAMES = ['eslint-errors', 'eslint-logging', 'eslint-module-effects'];

function unused(tool) {
  return {
    tool,
    rule: 'eslint/unused-disable-directive',
    path: 'src/main.ts',
    identity: 'directive:1',
    message: "Unused eslint-disable directive (no problems were reported from 'no-console').",
    classification: 'enforceable',
    location: { line: 1, column: 1 },
  };
}

function snapshot(usedBy) {
  const analyzers = NAMES.map((name) => ({
    name,
    version: '1',
    configurationHash: 'fixture',
    exclusions: [],
    lintedGlobs: { include: ['src/**/*.ts'], exclude: [] },
    createInvocation: () => ({ command: process.execPath, args: [] }),
  }));
  return runQualitySnapshot({
    analyzers,
    projectRoot: temporaryRoot('nitpicker-snapshot-directives-'),
    runTasks: (tasks) => ({
      reports: tasks.map(({ name }) => [name, { findings: name === usedBy ? [] : [unused(name)] }]),
      errors: [],
      timings: [],
    }),
  });
}

describe('unused directives in standalone snapshots', () => {
  it('counts an unused directive once in findings and per-tool totals', () => {
    const report = snapshot();

    expect(report.toolErrors).toEqual([]);
    expect(report.findings).toEqual([unused('eslint-errors')]);
    expect(report.summary.enforceableFindings).toBe(1);
    expect(report.summary.tools.map(({ name, total }) => ({ name, total }))).toEqual([
      { name: 'eslint-errors', total: 1 },
      { name: 'eslint-logging', total: 0 },
      { name: 'eslint-module-effects', total: 0 },
    ]);
  });

  it('does not report a directive used by another analyzer', () => {
    const report = snapshot('eslint-logging');

    expect(report.toolErrors).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.summary.enforceableFindings).toBe(0);
    expect(report.summary.overallStatus).toBe('clean');
  });
});
