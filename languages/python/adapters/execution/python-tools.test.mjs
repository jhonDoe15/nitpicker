import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createToolContext, runPythonTools } from './python-tools.mjs';
import {
  callsLog,
  contextFor,
  coverageRc,
  project,
  readReport,
  restoreTemporaryState,
  setEnvironment,
  temporaryRoot,
} from './python-tools-project.mjs';
import { fileURLToPath } from 'node:url';

afterEach(restoreTemporaryState);

describe('tool context', () => {
  it('puts the snapshot import roots before any existing PYTHONPATH', () => {
    const root = project();
    setEnvironment('PYTHONPATH', '/existing');

    const { context, reportRoot } = contextFor(root);

    expect(context.env).toEqual({
      PYTHONPATH: `${path.join(root, 'src')}${path.delimiter}/existing`,
      PYTHONDONTWRITEBYTECODE: '1',
      COVERAGE_FILE: path.join(reportRoot, '.coverage'),
    });
    expect(context.project).toEqual({
      formatter: 'ruff',
      formatterDetected: true,
      testRunner: 'unittest',
      targetVersion: 'py38',
      typeCheckers: [],
      sourceRoots: ['src'],
    });
  });
  it('takes the environment from the live checkout and the sources from the snapshot', () => {
    const live = project();
    const snapshot = temporaryRoot();
    mkdirSync(path.join(snapshot, 'src'));
    setEnvironment('PYTHONPATH', undefined);

    const context = createToolContext({
      projectRoot: snapshot,
      liveRoot: live,
      settings: { formatter: 'black', testRunner: 'unittest', sourceRoots: ['src'] },
    });

    expect(context.env).toEqual({
      PYTHONPATH: path.join(snapshot, 'src'),
      PYTHONDONTWRITEBYTECODE: '1',
    });
    expect(context.launcher.launch('ruff', []).env.VIRTUAL_ENV).toBe(path.join(live, '.venv'));
    expect(context.project).toEqual({
      formatter: 'black',
      formatterDetected: false,
      typeCheckers: [],
      testRunner: 'unittest',
      targetVersion: 'py38',
      sourceRoots: ['src'],
    });
  });
});
describe('running the tools', () => {
  it('writes the ruff, format and coverage reports of a clean project', () => {
    const root = project({
      'violations.txt': 'F401|src/demo/a.py|unused\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(JSON.parse(readReport(reportRoot, 'ruff.sarif')).runs[0].results).toHaveLength(1);
    expect(readReport(reportRoot, 'format.txt')).toBe('src/demo/a.py');
    expect(readReport(reportRoot, 'coverage.json')).toBe('{"files":{}}');
    expect(JSON.parse(readReport(reportRoot, 'type-check.json'))).toEqual({
      checker: 'mypy',
      output: '',
    });
    expect(readReport(reportRoot, 'rules.json')).toBe('[]');
    expect(JSON.parse(readReport(reportRoot, 'manifest.json'))).toEqual({
      formatter: 'ruff',
      formatterDetected: true,
      sourceRoots: ['src'],
      testsRan: true,
    });
    expect(readReport(reportRoot, 'coveragerc')).toBe(coverageRc('src'));
  });
  it('checks formatting with black when the project uses it', () => {
    const root = project({
      'pyproject.toml': '[tool.black]\n',
      'unformatted.txt': 'src/demo/a.py\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(readReport(reportRoot, 'format.txt')).toBe(path.join(root, 'src/demo/a.py'));
  });
  it('measures branches without honoring pragmas, the project config or test files', () => {
    const { context, reportRoot } = contextFor(
      project({ 'pyproject.toml': '[tool.coverage.run]\n' }),
    );

    runPythonTools(context);

    expect(readReport(reportRoot, 'coveragerc')).toBe(coverageRc('src'));
  });
  it('measures the source roots that exist and writes an empty report when none does', () => {
    const calls = callsLog();
    const root = project({ 'lib/a.py': '' });
    const both = contextFor(root, { sourceRoots: ['src', 'lib', 'missing'] });
    runPythonTools(both.context);
    expect(readReport(both.reportRoot, 'coveragerc')).toBe(coverageRc('src', 'lib'));

    const none = contextFor(root, { sourceRoots: ['missing'] });
    expect(runPythonTools(none.context)).toEqual([]);
    expect(readReport(none.reportRoot, 'coverage.json')).toBe('{"files":{}}');
    expect(calls('coverage', 'json')).toHaveLength(1);
  });
  it('names each failing step with its command and output', () => {
    const calls = ['ruff format', 'coverage run', 'mypy', 'python'];
    const structureScript = path.resolve(
      fileURLToPath(new URL('../', import.meta.url)),
      '../metrics/structure_metrics.py',
    );
    const root = project({
      'fail.json': JSON.stringify(
        Object.fromEntries(calls.map((call) => [call, `${call} blew up`])),
      ),
    });
    const { context } = contextFor(root);

    const failures = runPythonTools(context);

    expect(failures).toEqual(
      [
        ['format-failed', 'ruff format', 'ruff format'],
        ['tests-failed', 'coverage run', 'coverage run'],
        ['types-failed', 'mypy', 'mypy'],
        ['rules-failed', 'python', 'python'],
        ['structure-failed', `python ${structureScript}`, 'python'],
      ].map(([rule, command, call]) => ({
        rule,
        message: `${command} exited 2 in the virtualenv environment:\n${call} blew up`,
      })),
    );
  });
  it('names a failing coverage report', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'coverage json': 'it blew up' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'coverage-failed',
        message: 'coverage json exited 2 in the virtualenv environment:\nit blew up',
      },
    ]);
  });
  it('fails the lint step and the rules step when ruff itself fails', () => {
    const root = project({ 'fail.json': JSON.stringify({ 'ruff check': 'it blew up' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context).map(({ rule }) => rule)).toEqual([
      'ruff-failed',
      'rules-failed',
    ]);
  });
  it('reports every failing step, not only the first', () => {
    const root = project({ 'fail.json': JSON.stringify({ ruff: 'bad', coverage: 'worse' }) });
    const { context } = contextFor(root);

    expect(runPythonTools(context).map(({ rule }) => rule)).toEqual([
      'ruff-failed',
      'format-failed',
      'tests-failed',
      'rules-failed',
    ]);
  });
  it('accepts a run without tests', () => {
    const root = project({ 'test-exit.txt': '5\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);
    expect(JSON.parse(readReport(context.reportRoot, 'manifest.json')).testsRan).toBe(false);
  });
  it('reports a failing test run with its output', () => {
    const root = project({ 'test-exit.txt': '1\n' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'tests-failed',
        message: 'coverage run exited 1 in the virtualenv environment:\n1 failed: test_greet',
      },
    ]);
  });
  it('keeps the end of a long failure message', () => {
    const root = project({ 'fail.json': JSON.stringify({ ruff: `${'x'.repeat(5000)}THE END` }) });
    const { context } = contextFor(root);

    const [{ message }] = runPythonTools(context);

    expect(message).toMatch(
      /^ruff check exited 2 in the virtualenv environment:\n\.\.\.x+THE END$/,
    );
    expect(message.length).toBeLessThan(3200);
  });
  it('rejects a formatter that fails the check without naming a file', () => {
    const root = project({ 'unformatted.txt': 'src/demo/a.py\n' });
    writeFileSync(
      path.join(root, '.venv/bin/ruff'),
      `#!/bin/sh\nif [ "$1" = format ]; then echo 'something unexpected'; exit 1; fi\nexec "${process.execPath}" "${path.join(fileURLToPath(new URL('../', import.meta.url)), 'fixtures/fake-python-tools.mjs')}" ruff "$@"\n`,
    );
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'format-failed',
        message:
          'ruff reported unformatted files but its output named none:\nsomething unexpected\n',
      },
    ]);
  });
  it('reports a tool that cannot run for another reason', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), 'not a program\n', { mode: 0o755 });
    const { context } = contextFor(root);

    const [failure] = runPythonTools(context);

    expect(failure.rule).toBe('ruff-failed');
    expect(failure.message).toMatch(
      /^ruff check (could not run in the virtualenv environment|exited)/,
    );
  });
  it('names a failure that is not a tool failure', () => {
    const root = project();
    const { context, reportRoot } = contextFor(root);
    mkdirSync(path.join(reportRoot, 'format.txt'));

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'python-failed',
        message: `EISDIR: illegal operation on a directory, open '${path.join(reportRoot, 'format.txt')}'`,
      },
    ]);
  });
});
