import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePythonArguments } from '../python-runner.mjs';
import { createToolContext, runPythonTools } from '../python-tools.mjs';
import { readPythonFindings } from '../python-reports.mjs';
import {
  callsLog,
  project,
  readReport,
  restoreTemporaryState,
  temporaryRoot,
} from '../execution/test-support/python-tools-project.mjs';

afterEach(restoreTemporaryState);

function quickContext(root) {
  const reportRoot = temporaryRoot();
  const context = createToolContext({ projectRoot: root, liveRoot: root, reportRoot, quick: true });
  return { context, reportRoot };
}

describe('python quick mode', () => {
  it('reads --mode quick into the policy and refuses another mode', () => {
    expect(parsePythonArguments(['--project-root', '/p', '--mode', 'quick']).policy.quick).toBe(
      true,
    );
    expect(parsePythonArguments(['--project-root', '/p', '--mode', 'full']).policy.quick).toBe(
      undefined,
    );
    expect(() => parsePythonArguments(['--project-root', '/p', '--mode', 'fast'])).toThrow(
      '--mode must be one of: quick, full',
    );
  });

  it('runs the linter, formatter and type checker but never the tests or coverage', () => {
    const root = project({ 'violations.txt': 'F401|src/demo/a.py|unused\n' });
    const calls = callsLog();
    const { context, reportRoot } = quickContext(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(calls('ruff', 'check').length).toBeGreaterThan(0);
    expect(calls('coverage', 'run')).toEqual([]);
    expect(calls('coverage', 'json')).toEqual([]);
    expect(existsSync(path.join(reportRoot, 'coverage.json'))).toBe(false);
    expect(JSON.parse(readReport(reportRoot, 'manifest.json'))).toEqual({
      formatter: 'ruff',
      formatterDetected: true,
      quick: true,
      sourceRoots: ['src'],
      testFailures: [],
      testRunner: 'unittest',
    });
  });

  it('runs the tests and coverage in a full run', () => {
    const root = project();
    const calls = callsLog();
    const reportRoot = temporaryRoot();
    const context = createToolContext({ projectRoot: root, liveRoot: root, reportRoot });

    runPythonTools(context);

    expect(calls('coverage', 'run')).toHaveLength(1);
    expect(JSON.parse(readReport(reportRoot, 'manifest.json')).quick).toBeUndefined();
  });

  it('reads the static findings and none of the test-driven ones', () => {
    const root = project({ 'violations.txt': 'F401|src/demo/a.py|unused\n' });
    const { context, reportRoot } = quickContext(root);
    runPythonTools(context);

    const { findings } = readPythonFindings({ projectRoot: root, reportRoot, policy: {} });

    const tools = new Set(findings.map(({ tool }) => tool));
    expect(tools.has('ruff')).toBe(true);
    expect(findings.map(({ rule }) => rule)).not.toContain('no-tests-ran');
    for (const tool of ['coverage-py', 'coverage', 'crap', 'tests', 'test-runtime']) {
      expect(tools.has(tool)).toBe(false);
    }
  });
});
