import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jscpdVersion } from '../../../../core/tooling/jscpd/run-jscpd.mjs';
import { execute, failure, probe, probeVersion } from './python-process.mjs';
import { PYTEST_SCRIPT } from './python-test-runner.mjs';
import { mutationVersions, runPythonTools, toolVersions } from '../python-tools.mjs';
import {
  callsLog,
  contextFor,
  project,
  readReport,
  restoreTemporaryState,
  setEnvironment,
  temporaryRoot,
} from './test-support/python-tools-project.mjs';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

afterEach(restoreTemporaryState);

describe('running the import and duplicate tools', () => {
  it('writes the duplicate, import and import-linter reports', () => {
    const clone = [
      'def order_total(lines, discount):',
      '    total = 0',
      '    for line in lines:',
      '        if line.price > 0 and line.quantity > 0:',
      '            total += line.price * line.quantity',
      '        else:',
      '            total -= discount',
      '    return total',
      '',
    ].join('\n');
    const root = project({
      'src/demo/__init__.py': '',
      'src/demo/a.py': clone,
      'src/demo/b.py': clone,
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'import-scan.json': '{"src/demo/a.py":[]}',
      'lint-imports.txt': 'Contracts: 1 kept, 0 broken.\n',
    });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(JSON.parse(readReport(reportRoot, 'duplicates.json')).runs).toHaveLength(1);
    expect(JSON.parse(readReport(reportRoot, 'imports.json'))).toEqual({
      modules: [
        { file: 'src/demo/__init__.py', module: 'demo', isPackage: true },
        { file: 'src/demo/a.py', module: 'demo.a', isPackage: false },
        { file: 'src/demo/b.py', module: 'demo.b', isPackage: false },
      ],
      others: [],
      imports: { 'src/demo/a.py': [] },
    });
    expect(readReport(reportRoot, 'import-linter.txt')).toBe('Contracts: 1 kept, 0 broken.\n');
  });
  it('does not run import-linter for a project without contracts', () => {
    const root = project({ 'lint-imports.txt': 'Contracts: 0 kept, 1 broken.\n' });
    const { context, reportRoot } = contextFor(root);

    expect(runPythonTools(context)).toEqual([]);

    expect(() => readReport(reportRoot, 'import-linter.txt')).toThrow();
  });
  it.each([
    ['python', 'coupling-failed'],
    ['lint-imports', 'import-linter-failed'],
  ])('names the failing step: %s is %s', (tool, rule) => {
    const root = project({
      'src/demo/a.py': '',
      '.importlinter': '[importlinter]\nroot_package = demo\n',
      'fail.json': JSON.stringify({ [tool]: 'it blew up' }),
    });
    const { context } = contextFor(root, { testRunner: 'unittest' });

    expect(runPythonTools(context).map((failure) => failure.rule)).toContain(rule);
  });
  it('says where a missing tool should be installed', () => {
    const root = project({}, { tools: ['black', 'coverage', 'python'] });
    setEnvironment('PATH', temporaryRoot());
    const { context } = contextFor(root);

    expect(runPythonTools(context)[0]).toEqual({
      rule: 'ruff-failed',
      message: `ruff was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it. ${linkSentence('pythonToolMissing')}`,
    });
  });
  it('tells how to turn the contracts off when lint-imports is not installed', () => {
    const root = project(
      { '.importlinter': '[importlinter]\nroot_package = demo\n', 'conftest.py': '' },
      { tools: ['ruff', 'coverage', 'mypy', 'python'] },
    );
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'import-linter-failed',
        message: `lint-imports was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it, or turn the contracts off with "python": { "importLinter": false }. ${linkSentence('pythonToolMissing')}`,
      },
    ]);
  });
});
describe('running pytest', () => {
  it('keeps the project pytest configuration working under the outer coverage run, timing the call phase and function-scoped setup', () => {
    const calls = callsLog();
    const root = project({
      'conftest.py': '',
      'pytest-cov.txt': '',
      'xdist.txt': '',
    });
    const { context, reportRoot } = contextFor(root);

    runPythonTools(context);

    expect(calls('coverage', 'run')[0].args.slice(3)).toEqual([
      PYTEST_SCRIPT,
      '-q',
      '-o',
      `cache_dir=${path.join(reportRoot, 'pytest-cache')}`,
      '--no-cov',
      '-n0',
      '--continue-on-collection-errors',
      `--junitxml=${path.join(reportRoot, 'pytest-junit.xml')}`,
      '-o',
      'junit_family=xunit1',
      '-o',
      'junit_duration_report=call',
    ]);
  });
  it('is an environment error naming the override when pytest is indicated but not importable', () => {
    const root = project({ 'conftest.py': '', 'no-pytest.txt': '' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'environment-failed',
        message: `pytest is used by this project but cannot be imported in the virtualenv environment: install it there, or set "python.testRunner" to "unittest". ${linkSentence('pythonToolMissing')}`,
      },
    ]);
  });
});
describe('running the Django and nose2 runners', () => {
  it.each([
    ['django', 'manage.py', '', ['manage.py', 'test', '--noinput']],
    ['django', 'backend/manage.py', 'backend', ['manage.py', 'test', '--noinput']],
    ['nose2', 'nose2.cfg', '', ['-m', 'nose2']],
  ])('runs the %s tests of %s under coverage', (testRunner, file, directory, command) => {
    const calls = callsLog();
    const root = project({ [file]: '' });

    expect(runPythonTools(contextFor(root, { testRunner }).context)).toEqual([]);

    const [{ args, cwd }] = calls('coverage', 'run');
    expect([args.slice(3), cwd]).toEqual([command, path.join(root, directory)]);
  });
  it.each([
    ['django', 'Django'],
    ['nose2', 'nose2'],
  ])('is an environment error when %s is not installed', (testRunner, distribution) => {
    const calls = callsLog();
    const root = project({ [`no-${distribution}.txt`]: '', 'manage.py': '' });

    expect(runPythonTools(contextFor(root, { testRunner }).context)).toEqual([
      {
        rule: 'environment-failed',
        message: `${distribution} runs the tests of this project but is not installed in the virtualenv environment: install it there, or set "python.testRunner" to the runner the tests use. ${linkSentence('pythonToolMissing')}`,
      },
    ]);
    expect(calls('coverage', 'run')).toEqual([]);
  });
  it('names where manage.py was looked for when there is none', () => {
    const root = project({ 'backend/settings.py': '' });

    expect(runPythonTools(contextFor(root, { testRunner: 'django' }).context)).toEqual([
      {
        rule: 'environment-failed',
        message: `the tests run with Django's manage.py test, but there is no manage.py at ${path.join(root, 'manage.py')} or one directory below it: add it there, or set "python.testRunner" to the runner the tests use. ${linkSentence('pythonToolMissing')}`,
      },
    ]);
  });
});
describe('failure messages', () => {
  it('says a tool timed out instead of quoting the system error', () => {
    const root = project();
    const { context } = contextFor(root);

    const error = failure({
      context,
      command: ['coverage', 'run'],
      result: { error: { code: 'ETIMEDOUT' } },
      rule: 'x',
    });

    expect(error.message).toBe(
      `coverage run timed out after 25 minutes in the virtualenv environment. ${linkSentence('analyzerTimeout')}`,
    );
  });
});
describe('tool versions', () => {
  it('lists the versions of the tools in use', () => {
    const root = project({ 'conftest.py': '' });

    const jscpd = `jscpd@${jscpdVersion()}`;

    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(root, { formatter: 'black' }).context)).toBe(
      `ruff@0.9.9;black@24.1.0;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(root, { typeChecker: 'pyright' }).context)).toBe(
      `ruff@0.9.9;pyright@1.1.390;coverage@7.6.1;pytest@8.3.1;${jscpd}`,
    );
    expect(toolVersions(contextFor(project()).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;unittest;${jscpd}`,
    );
    expect(mutationVersions(contextFor(root).context)).toBe(
      'mutmut@3.8.0;pytest@8.3.1;pytest-django@missing',
    );
  });
  it('names the Django and nose2 versions, and whether pytest-django can run the mutants', () => {
    const jscpd = `jscpd@${jscpdVersion()}`;
    const django = (files) =>
      contextFor(project({ 'manage.py': '', ...files }), { testRunner: 'django' }).context;

    expect(toolVersions(django())).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;django@5.1.0;${jscpd}`,
    );
    expect(toolVersions(contextFor(project(), { testRunner: 'nose2' }).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;nose2@5.1.0;${jscpd}`,
    );
    expect(mutationVersions(django())).toBe('mutmut@3.8.0;pytest@8.3.1;pytest-django@missing');
    expect(mutationVersions(django({ 'pytest-django.txt': '' }))).toBe(
      'mutmut@3.8.0;pytest@8.3.1;pytest-django@installed',
    );
  });
  it('adds import-linter to the versions when the project has contracts', () => {
    const root = project({ '.importlinter': '[importlinter]\n', 'conftest.py': '' });

    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@0.9.9;mypy@1.13.0;coverage@7.6.1;pytest@8.3.1;jscpd@${jscpdVersion()};import-linter@2.5`,
    );
    expect(toolVersions(contextFor(root, { importLinter: false }).context)).not.toContain(
      'import-linter',
    );
  });
  it('reads the import-linter version from the installed package, which old versions can only give that way', () => {
    const calls = callsLog();
    const root = project({ '.importlinter': '[importlinter]\n', 'conftest.py': '' });

    toolVersions(contextFor(root).context);

    expect(calls('python', '-I').map((call) => call.args.at(-1))).toEqual([
      'import importlib.metadata as m; print(m.version("import-linter"))',
    ]);
    expect(calls('lint-imports', '--version')).toEqual([]);
  });
  it('marks tools that are missing', () => {
    const root = project({ 'no-pytest.txt': '', 'no-mutmut.txt': '' }, { tools: ['python'] });
    setEnvironment('PATH', temporaryRoot());

    const jscpd = `jscpd@${jscpdVersion()}`;

    expect(toolVersions(contextFor(root, { testRunner: 'pytest' }).context)).toBe(
      `ruff@missing;types@missing;coverage@missing;pytest@missing;${jscpd}`,
    );
    expect(toolVersions(contextFor(root).context)).toBe(
      `ruff@missing;types@missing;coverage@missing;unittest;${jscpd}`,
    );
    expect(mutationVersions(contextFor(root).context)).toBe(
      'mutmut@missing;pytest@missing;pytest-django@missing',
    );
  });
  it('marks a version it cannot read', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), '#!/bin/sh\necho ruff dev build\n', {
      mode: 0o755,
    });

    expect(toolVersions(contextFor(root).context)).toMatch(/^ruff@unknown;/);
  });
});

function recordingSpawn(stdout = 'tool 1.2.3\n') {
  const calls = [];
  function spawn(command, args, options) {
    calls.push({ command, args, options });
    return { status: 0, stdout, stderr: '' };
  }
  return { calls, spawn };
}

function launch(tool, args) {
  return { command: `/venv/bin/${tool}`, args, env: { VIRTUAL_ENV: '/venv' } };
}

function contextWith(spawn, overrides = {}) {
  return {
    spawn,
    projectRoot: '/work/head',
    env: { PYTHONPATH: '/work/head/src' },
    launcher: { launch },
    ...overrides,
  };
}

describe('running a tool', () => {
  it('starts the launched command in the project with the merged environment and the timeout', () => {
    const { calls, spawn } = recordingSpawn();
    const context = contextWith(spawn);

    execute(context, ['ruff', '--version'], { timeout: 1234, env: { EXTRA: '1' } });

    expect(calls).toEqual([
      {
        command: '/venv/bin/ruff',
        args: ['--version'],
        options: {
          cwd: '/work/head',
          env: { ...process.env, VIRTUAL_ENV: '/venv', PYTHONPATH: '/work/head/src', EXTRA: '1' },
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          timeout: 1234,
        },
      },
    ]);
  });
});

describe('probing a tool', () => {
  it('runs one command once for the same launch, project and environment', () => {
    const { calls, spawn } = recordingSpawn();
    const context = contextWith(spawn);

    const first = probe(context, ['ruff', '--version']);
    const second = probe(context, ['ruff', '--version']);

    expect(calls).toHaveLength(1);
    expect(second).toBe(first);
  });

  it('runs a command again for another project root', () => {
    const { calls, spawn } = recordingSpawn();
    const shared = new Map();

    probe(contextWith(spawn, { probes: shared }), ['ruff', '--version']);
    probe(contextWith(spawn, { probes: shared, projectRoot: '/work/base' }), ['ruff', '--version']);

    expect(calls.map(({ options }) => options.cwd)).toEqual(['/work/head', '/work/base']);
  });

  it('runs a command again for another context environment', () => {
    const { calls, spawn } = recordingSpawn();
    const shared = new Map();

    probe(contextWith(spawn, { probes: shared }), ['ruff', '--version']);
    probe(contextWith(spawn, { probes: shared, env: { PYTHONPATH: '/work/head/lib' } }), [
      'ruff',
      '--version',
    ]);

    expect(calls.map(({ options }) => options.env.PYTHONPATH)).toEqual([
      '/work/head/src',
      '/work/head/lib',
    ]);
  });

  it('runs a command again for another launched command or arguments', () => {
    const { calls, spawn } = recordingSpawn();
    const context = contextWith(spawn);

    probe(context, ['ruff', '--version']);
    probe(context, ['black', '--version']);
    probe(context, ['ruff', 'rule']);

    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      ['/venv/bin/ruff', '--version'],
      ['/venv/bin/black', '--version'],
      ['/venv/bin/ruff', 'rule'],
    ]);
  });

  it('shares answers only between contexts that hold the same memo', () => {
    const { calls, spawn } = recordingSpawn();
    const memo = new Map();

    probe(contextWith(spawn, { probes: memo }), ['ruff', '--version']);
    probe(contextWith(spawn, { probes: memo }), ['ruff', '--version']);
    probe(contextWith(spawn, { probes: new Map() }), ['ruff', '--version']);

    expect(calls).toHaveLength(2);
  });

  it('works for a context built without a memo and keeps the memo on that context', () => {
    const { calls, spawn } = recordingSpawn();
    const context = contextWith(spawn);

    probe(context, ['ruff', '--version']);
    probe(context, ['ruff', '--version']);

    expect(calls).toHaveLength(1);
  });

  it('reads the version from a memoized probe', () => {
    const { calls, spawn } = recordingSpawn('Coverage.py, version 7.6.1 with C extension\n');
    const context = contextWith(spawn);

    const versions = [
      probeVersion(context, ['coverage', '--version']),
      probeVersion(context, ['coverage', '--version']),
    ];

    expect(versions).toEqual(['7.6.1', '7.6.1']);
    expect(calls).toHaveLength(1);
  });
});
