import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPythonDependencies } from '../../libraries/python-dependencies.mjs';
import { readDependencyFindings, scanDependencies } from './dependency-findings.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function directory(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-dependency-findings-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const PYPROJECT = [
  '[project]',
  'dependencies = ["requests", "attrs", "psycopg2-binary", "rich", "tabulate"]',
  '[dependency-groups]',
  'dev = ["pytest", "freezegun"]',
].join('\n');

const SCAN = {
  python: [3, 12],
  stdlib: ['os', 'json'],
  modules: {
    requests: ['requests'],
    attrs: ['attrs'],
    attr: ['attrs'],
    psycopg2: ['psycopg2-binary'],
    rich: ['rich'],
    tabulate: ['tabulate'],
    yaml: ['PyYAML'],
    freezegun: ['freezegun'],
    pytest: ['pytest'],
    google: ['google-auth', 'protobuf'],
  },
  entryPoints: [],
  optional: {},
  references: [],
};

const from = (module, names = ['x']) => ({ level: 0, module, names });

function reports(projectRoot, { scan = SCAN, imports }) {
  const reportRoot = directory({
    'imports.json': JSON.stringify(imports),
    'dependencies.json': JSON.stringify({
      declared: readPythonDependencies(projectRoot),
      scan,
      environment: 'virtualenv',
    }),
  });
  return { reportRoot, projectRoot };
}

const IMPORTS = {
  modules: [{ file: 'src/app/a.py', module: 'app.a', isPackage: false }],
  others: [{ file: 'tests/test_a.py', module: 'tests.test_a', kind: 'test', inRoots: false }],
  imports: {
    'src/app/a.py': [
      from('requests'),
      { level: 0, module: null, names: ['attr', 'os', 'app.b'] },
      from('yaml'),
      from('freezegun'),
      { ...from('rich'), typeOnly: true },
      from('google.protobuf'),
    ],
    'tests/test_a.py': [from('pytest'), from('yaml')],
  },
};

describe('Python dependency findings', () => {
  it('reports unlisted, dev-only and unused dependencies like the TypeScript preset, and counts a type-only import as use', () => {
    const findings = readDependencyFindings(
      reports(directory({ 'pyproject.toml': PYPROJECT }), { imports: IMPORTS }),
    );

    expect(findings.map(({ rule, path: file, identity }) => [rule, file, identity])).toEqual([
      ['unlisted-dependency', 'src/app/a.py', 'unlisted:pyyaml'],
      ['no-dev-dependency-in-production', 'src/app/a.py', 'dev-only:freezegun'],
      ['unlisted-dependency', 'tests/test_a.py', 'unlisted:pyyaml'],
      ['unused-dependency', 'pyproject.toml', 'unused:tabulate'],
    ]);
    expect(findings.map(({ message }) => message)).toEqual([
      'Package pyyaml is imported (as yaml) but not listed in pyproject.toml. Add it to the project dependencies (a dev dependency group for tests and tooling)',
      'freezegun is only a dev dependency, but production code imports it. Move it to the production dependencies in pyproject.toml',
      'Package pyyaml is imported (as yaml) but not listed in pyproject.toml. Add it to the project dependencies (a dev dependency group for tests and tooling)',
      'Unused dependency tabulate: nothing imports or runs it. Remove it from pyproject.toml',
    ]);
    expect(findings.at(-1).location).toEqual({ line: 2 });
  });
  it('counts entry points, string references and the optional backends of a declared package as use', () => {
    const scan = {
      ...SCAN,
      entryPoints: ['rich'],
      references: ['attr'],
      optional: { requests: ['PySocks'] },
      modules: { ...SCAN.modules, socks: ['PySocks'] },
    };
    const projectRoot = directory({
      'pyproject.toml': '[project]\ndependencies = ["requests", "attrs", "rich", "pysocks"]\n',
    });

    expect(
      readDependencyFindings(
        reports(projectRoot, {
          scan,
          imports: { ...IMPORTS, imports: { 'src/app/a.py': [from('requests')] } },
        }),
      ),
    ).toEqual([]);
  });
  it('checks nothing when the declaration is incomplete, and skips alone on Python before 3.10', () => {
    const incomplete = directory({ 'setup.py': 'setup()\n' });
    expect(readDependencyFindings(reports(incomplete, { imports: IMPORTS }))).toEqual([]);

    const old = reports(directory({ 'pyproject.toml': PYPROJECT }), {
      scan: { python: [3, 9] },
      imports: IMPORTS,
    });
    expect(readDependencyFindings({ ...old, snapshot: 'base' })).toEqual([
      {
        tool: 'dependencies',
        rule: 'tool-skipped',
        path: '.',
        identity: 'tool-skipped',
        classification: 'tool-error',
        message:
          'The dependency checks did not run in the base snapshot: they read the installed distributions with importlib.metadata.packages_distributions, which needs Python 3.10 or newer, and the virtualenv environment runs Python 3.9. The other analyzers still ran.',
      },
    ]);
  });
  it('leaves test imports alone when the project declares no dev dependencies', () => {
    const projectRoot = directory({ 'requirements.txt': 'requests\n' });
    const imports = {
      ...IMPORTS,
      imports: { 'src/app/a.py': [from('requests')], 'tests/test_a.py': [from('pytest')] },
    };

    expect(readDependencyFindings(reports(projectRoot, { imports }))).toEqual([]);
  });
  it('scans the project and test files with the project interpreter and stores the answer', () => {
    const projectRoot = directory({ 'requirements.txt': 'requests\n' });
    const reportRoot = directory({ 'imports.json': JSON.stringify(IMPORTS) });
    const calls = [];

    scanDependencies(
      { reportRoot, projectRoot, launcher: { description: 'uv' } },
      (_, command, options) => {
        calls.push({ command, options, request: JSON.parse(readFileSync(command.at(-1), 'utf8')) });
        return { stdout: JSON.stringify(SCAN) };
      },
    );

    expect(calls[0].command.slice(0, 2)).toEqual(['python', '-I']);
    expect(calls[0].command[2]).toMatch(/distribution-scan\.py$/u);
    expect(calls[0].options).toEqual({ rule: 'dependencies-failed' });
    expect(calls[0].request.files).toEqual(['src/app/a.py', 'tests/test_a.py']);
    const stored = JSON.parse(readFileSync(path.join(reportRoot, 'dependencies.json'), 'utf8'));
    expect(stored.environment).toBe('uv');
    expect(stored.declared.runtime).toEqual(['requests']);
  });
});
