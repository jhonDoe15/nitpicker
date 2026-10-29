import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { runCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { LEGACY_VIOLATION, usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { docsUrl } from '../../../shared/messages/docs-url.mjs';

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
  it.each([
    ['in the test process', false],
    ['as a child process', true],
  ])(
    'passes the followed conventions to the formatter when the runner runs %s',
    (_where, subprocess) => {
      const calls = callsLog();
      const wide = [110, 115].map((width) => `x = ${'a'.repeat(width - 4)}\n`).join('');
      const root = pythonRepository({
        'pyproject.toml': '[project]\nname = "demo"\nversion = "0.1.0"\n\n[tool.black]\n',
        'src/demo/wide.py': wide,
      });
      writeFiles(root, { 'src/demo/b.py': 'x = 1\n' });
      commit(root, 'change');

      const result = run(root, [], { subprocess });

      expect(result.exitCode, result.text).toBe(0);
      const checks = calls()
        .filter(({ tool, args }) => tool === 'black' && args[0] === '--check')
        .map(({ args }) => [...args.slice(0, 1), ...args.slice(3)]);
      expect(checks).toEqual([
        ['--check', '--line-length', '120', '--target-version', 'py38', '.'],
        ['--check', '--line-length', '120', '--target-version', 'py38', '.'],
      ]);
    },
  );
  it('rejects the TypeScript-only config keys', () => {
    const root = pythonRepository({
      'nitpicker.config.json': '{ "preset": "python", "layout": { "sourceRoots": ["src"] } }\n',
    });

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toMatch(
      /^nitpicker failed: nitpicker.config.json: "layout.sourceRoots" is not supported with "preset": "python"/,
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
    expect(out.text).toMatch(/^Format with ruff: ruff format --isolated /);
    expect(out.text.replace(/^Format with ruff: .*\n/, '')).toBe(
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
        'ruff/F401 src/demo/a.py:1 `os` imported but unused. If this is intended, add {"rule":"F401","paths":["src/demo/a.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.',
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
        `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`,
        '',
      ].join('\n'),
    );
  });
  it('keeps the other findings when pytest tests fail, and names the failing tests as a tool error', () => {
    const root = pythonRepository({ 'tests/conftest.py': '' });
    writeFiles(root, {
      'test-exit.txt': '1\n',
      'violations.txt': `${LEGACY_VIOLATION}F841|src/demo/a.py|unused variable\n`,
    });
    commit(root, 'break a test and add a finding');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'tests',
        snapshot: 'head',
        rule: 'tests-failed',
        path: '.',
        message: [
          'Tests fail in the head snapshot. Make each failing test pass:',
          '  tests/test_greet.py::test_greet',
          'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
          'Mutation testing (mutmut) leaves out the test modules tests/test_greet.py.',
        ].join('\n'),
      },
    ]);
    const ruff = result.json('new-findings.json').filter(({ tool }) => tool === 'ruff');
    expect(ruff.map(({ rule, path: file }) => `${rule} ${file}`)).toEqual(['F841 src/demo/a.py']);
  });
});
