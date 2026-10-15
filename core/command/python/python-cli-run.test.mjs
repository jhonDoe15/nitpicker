import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { runCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { callsLog, pythonRepository, run, temporaryRoot } = usePythonFixtures(nitpickerCli);

describe('nitpicker with "preset": "python" running the project', () => {
  it('fails a change that leaves the project without any test', () => {
    const root = pythonRepository();
    writeFiles(root, { 'test-exit.txt': '5\n' });
    commit(root, 'delete the tests');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'python',
        rule: 'no-tests-ran',
        path: '.',
        identity: 'no-tests-ran',
        message: 'No tests ran. Keep the project tests, or restore the ones this change removed.',
        classification: 'enforceable',
      },
    ]);
  });
  it('reports a failing test run on head as a tool error with exit 2 instead of throwing', () => {
    const root = pythonRepository();
    writeFiles(root, { 'test-exit.txt': '1\n' });
    commit(root, 'break the tests');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'python',
        snapshot: 'head',
        rule: 'tests-failed',
        path: '.',
        message: 'coverage run exited 1 in the virtualenv environment:\n1 failed: test_greet',
      },
    ]);
  });
  it('reports a missing environment as a tool error', () => {
    const root = pythonRepository({
      'nitpicker.config.json':
        '{ "preset": "python", "python": { "environment": "no-such-venv" } }\n',
    });
    writeFiles(root, { 'src/demo/b.py': 'x = 1\n' });
    commit(root, 'change');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    const message = `No Python environment at ${path.join(root, 'no-such-venv')} (${path.join(root, 'no-such-venv/bin')} does not exist): create it, or set "python.environment"`;
    expect(
      result
        .json('tool-errors.json')
        .sort((a, b) => `${a.tool} ${a.snapshot}`.localeCompare(`${b.tool} ${b.snapshot}`)),
    ).toEqual(
      ['mutation', 'python'].flatMap((tool) =>
        ['base', 'head'].map((snapshot) => ({ tool, snapshot, message })),
      ),
    );
  });
  it('runs base sources, not the head ones, against the environment of the checkout', () => {
    const calls = callsLog();
    const root = pythonRepository();
    writeFiles(root, { 'src/demo/a.py': 'def value():\n    return 2\n' });
    commit(root, 'change behaviour');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    const testRuns = calls().filter(({ tool, args }) => tool === 'coverage' && args[0] === 'run');
    expect(testRuns).toHaveLength(2);
    const [first, second] = testRuns;
    expect(first.cwd).not.toBe(second.cwd);
    for (const testRun of testRuns) {
      expect(testRun.pythonPath.split(path.delimiter)[0]).toBe(path.join(testRun.cwd, 'src'));
      expect(testRun.cwd).not.toBe(root);
    }
  });
  it('rejects the TypeScript-only config keys', () => {
    const root = pythonRepository({
      'nitpicker.config.json': '{ "preset": "python", "layout": { "sourceRoots": ["src"] } }\n',
    });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toMatch(
      /^nitpicker failed: nitpicker.config.json: "layout" is not supported with "preset": "python"/,
    );
  });
  it('gates a snapshot with --all', () => {
    const root = pythonRepository();
    const reports = path.join(temporaryRoot('nitpicker-python-snapshot-'), 'reports');
    const out = { text: '' };

    const exitCode = runCli({
      arguments_: ['--all', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: {
        write: (value) => {
          out.text += value;
        },
      },
      stderr: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(out.text).toBe(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 1',
        'Descriptive findings: 12',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'python: total=13 enforceable=1 descriptive=12',
        'mutation: total=0 enforceable=0 descriptive=0',
        'repository-hygiene: total=0 enforceable=0 descriptive=0',
        '',
        'Enforceable findings:',
        'ruff/F401 src/demo/a.py:1 `os` imported but unused. To allow it for some paths, add a "python.exceptions" entry for F401 in nitpicker.config.json.',
        '',
        'Descriptive findings:',
        'coupling/coupling . dependencies summary',
        'coupling/coupling . modules summary',
        'coupling/coupling . packages summary',
        'coupling/package-coupling . connectedComponents for package demo',
        'coupling/package-coupling . fanIn for package demo',
        'coupling/package-coupling . fanOut for package demo',
        'coupling/package-coupling . internalEdges for package demo',
        'coupling/package-coupling . largestComponentShare for package demo',
        'coupling/package-coupling . modules for package demo',
        'coupling/module-coupling src/demo/a.py fanIn for src/demo/a.py',
        'coupling/module-coupling src/demo/a.py fanOut for src/demo/a.py',
        'coupling/module-coupling src/demo/a.py totalCoupling for src/demo/a.py',
        '',
      ].join('\n'),
    );
  });
});
