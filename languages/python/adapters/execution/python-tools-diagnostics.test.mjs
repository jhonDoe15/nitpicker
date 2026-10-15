import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jscpdVersion } from '../../../java/adapters/metrics/java-duplicates.mjs';
import { failure } from './python-process.mjs';
import { mutationVersions, runPythonTools, toolVersions } from './python-tools.mjs';
import {
  callsLog,
  contextFor,
  project,
  readReport,
  restoreTemporaryState,
  setEnvironment,
  temporaryRoot,
} from './test-support/python-tools-project.mjs';

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
      message:
        'ruff was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it',
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
        message:
          'lint-imports was not found in the virtualenv environment: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it, or turn the contracts off with "python": { "importLinter": false }',
      },
    ]);
  });
});
describe('running pytest', () => {
  it('keeps the project pytest configuration working under the outer coverage run', () => {
    const calls = callsLog();
    const root = project({
      'conftest.py': '',
      'pytest-cov.txt': '',
      'xdist.txt': '',
    });
    const { context, reportRoot } = contextFor(root);

    runPythonTools(context);

    expect(calls('coverage', 'run')[0].args.slice(3)).toEqual([
      '-m',
      'pytest',
      '-q',
      '-o',
      `cache_dir=${path.join(reportRoot, 'pytest-cache')}`,
      '--no-cov',
      '-n0',
    ]);
  });
  it('is an environment error naming the override when pytest is indicated but not importable', () => {
    const root = project({ 'conftest.py': '', 'no-pytest.txt': '' });
    const { context } = contextFor(root);

    expect(runPythonTools(context)).toEqual([
      {
        rule: 'environment-failed',
        message:
          'pytest is used by this project but cannot be imported in the virtualenv environment: install it there, or set "python.testRunner" to "unittest"',
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
      'coverage run timed out after 25 minutes in the virtualenv environment',
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
    expect(mutationVersions(contextFor(root).context)).toBe('mutmut@3.8.0;pytest@8.3.1');
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
    expect(mutationVersions(contextFor(root).context)).toBe('mutmut@missing;pytest@missing');
  });
  it('marks a version it cannot read', () => {
    const root = project();
    writeFileSync(path.join(root, '.venv/bin/ruff'), '#!/bin/sh\necho ruff dev build\n', {
      mode: 0o755,
    });

    expect(toolVersions(contextFor(root).context)).toMatch(/^ruff@unknown;/);
  });
});
