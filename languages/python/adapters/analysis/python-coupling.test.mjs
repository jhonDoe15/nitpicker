import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzePythonCoupling,
  importEdges,
  readCouplingFindings,
  scanImports,
} from './python-coupling.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-coupling-')));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const module = (name, { isPackage = false } = {}) => ({
  module: name,
  file: `src/${name.replaceAll('.', '/')}${isPackage ? '/__init__' : ''}.py`,
  isPackage,
});
const absolute = (moduleName, ...names) => ({ level: 0, module: moduleName, names });
const plain = (...names) => ({ level: 0, module: null, names });
const relative = (level, moduleName, ...names) => ({ level, module: moduleName, names });

function edgesOf(modules, importer, ...statements) {
  const source = modules.find((entry) => entry.module === importer);
  return importEdges(modules, { [source.file]: statements });
}

describe('resolving imports to modules', () => {
  const modules = [
    module('app', { isPackage: true }),
    module('app.core'),
    module('app.sub', { isPackage: true }),
    module('app.sub.leaf'),
    module('app.sub.other'),
  ];

  it('links the longest known module of a plain import', () => {
    expect(edgesOf(modules, 'app.core', plain('app.sub.leaf.Thing', 'os.path', 'app.sub'))).toEqual(
      [
        { source: 'app.core', target: 'app.sub.leaf', kind: 'runtime' },
        { source: 'app.core', target: 'app.sub', kind: 'runtime' },
      ],
    );
  });

  it('links a submodule imported from its package and the package for any other name', () => {
    expect(
      edgesOf(modules, 'app.core', absolute('app.sub', 'leaf', 'helper'), absolute('app', '*')),
    ).toEqual([
      { source: 'app.core', target: 'app.sub.leaf', kind: 'runtime' },
      { source: 'app.core', target: 'app.sub', kind: 'runtime' },
      { source: 'app.core', target: 'app', kind: 'runtime' },
    ]);
  });

  it('ignores imports of modules outside the analyzed sources', () => {
    expect(
      edgesOf(modules, 'app.core', absolute('os', 'path'), absolute('__future__', 'annotations')),
    ).toEqual([]);
  });

  it('resolves relative imports from the package of a module', () => {
    expect(
      edgesOf(
        modules,
        'app.sub.leaf',
        relative(1, null, 'other'),
        relative(1, 'other', 'Thing'),
        relative(2, 'core', 'run'),
        relative(2, null, 'core'),
        relative(1, null, 'missing'),
      ),
    ).toEqual([
      { source: 'app.sub.leaf', target: 'app.sub.other', kind: 'runtime' },
      { source: 'app.sub.leaf', target: 'app.sub.other', kind: 'runtime' },
      { source: 'app.sub.leaf', target: 'app.core', kind: 'runtime' },
      { source: 'app.sub.leaf', target: 'app.core', kind: 'runtime' },
      { source: 'app.sub.leaf', target: 'app.sub', kind: 'runtime' },
    ]);
  });

  it('resolves relative imports of a package from the package itself', () => {
    expect(
      edgesOf(modules, 'app.sub', relative(1, 'leaf', 'Thing'), relative(2, null, 'core')),
    ).toEqual([
      { source: 'app.sub', target: 'app.sub.leaf', kind: 'runtime' },
      { source: 'app.sub', target: 'app.core', kind: 'runtime' },
    ]);
  });

  it('drops a relative import that climbs above the top-level package', () => {
    expect(edgesOf(modules, 'app.core', relative(3, 'x', 'y'))).toEqual([]);
  });

  it('resolves a relative import in a top-level module', () => {
    const flat = [module('script'), module('helpers')];

    expect(edgesOf(flat, 'script', relative(1, null, 'helpers'))).toEqual([
      { source: 'script', target: 'helpers', kind: 'runtime' },
    ]);
  });

  it('marks the edges of imports under if TYPE_CHECKING as type-only', () => {
    expect(
      edgesOf(
        modules,
        'app.core',
        { ...absolute('app.sub', 'leaf'), typeOnly: true },
        { ...plain('app.sub.other'), typeOnly: false },
        absolute('app', '*'),
      ),
    ).toEqual([
      { source: 'app.core', target: 'app.sub.leaf', kind: 'type-only' },
      { source: 'app.core', target: 'app.sub.other', kind: 'runtime' },
      { source: 'app.core', target: 'app', kind: 'runtime' },
    ]);
  });

  it('treats a module the scan could not read as importing nothing', () => {
    expect(importEdges(modules, {})).toEqual([]);
  });
});

describe('analyzing the import graph', () => {
  const modules = [
    module('app', { isPackage: true }),
    module('app.cli'),
    module('app.domain', { isPackage: true }),
    module('app.domain.rules'),
    module('app.infra', { isPackage: true }),
    module('app.infra.db'),
    module('script'),
  ];
  const imports = {
    'src/app/cli.py': [absolute('app.domain', 'rules')],
    'src/app/domain/rules.py': [absolute('app.infra', 'db')],
    'src/script.py': [plain('app.cli')],
  };

  it('groups modules by package and reports file-level metrics', () => {
    const report = analyzePythonCoupling({ modules, imports });

    expect(report.summary).toEqual({ modules: 7, dependencies: 3, packages: 4 });
    expect(report.packages.map(({ name }) => name)).toEqual([
      '(root)',
      'app',
      'app.domain',
      'app.infra',
    ]);
    expect(report.modules.find(({ file }) => file === 'src/app/domain/rules.py')).toEqual({
      file: 'src/app/domain/rules.py',
      fanIn: 1,
      fanOut: 1,
      totalCoupling: 2,
      instability: 0.5,
    });
  });

  it('flags a stable package that depends on a less stable one', () => {
    const report = analyzePythonCoupling({
      modules: [
        module('base', { isPackage: true }),
        module('base.core'),
        module('feature', { isPackage: true }),
        module('feature.a'),
        module('feature.b'),
        module('other', { isPackage: true }),
        module('other.o'),
      ],
      imports: {
        'src/feature/a.py': [absolute('base', 'core')],
        'src/feature/b.py': [absolute('base', 'core')],
        'src/base/core.py': [absolute('other', 'o')],
        'src/other/o.py': [absolute('feature', 'a')],
      },
    });

    expect(report.stabilityDirection.map(({ source, target }) => `${source}>${target}`)).toEqual([
      'base>other',
    ]);
  });

  describe('imports under if TYPE_CHECKING', () => {
    const inversion = [
      module('base', { isPackage: true }),
      module('base.core'),
      module('feature', { isPackage: true }),
      module('feature.a'),
      module('feature.b'),
      module('other', { isPackage: true }),
      module('other.o'),
    ];
    const importsWith = (...baseImports) => ({
      'src/feature/a.py': [absolute('base', 'core')],
      'src/feature/b.py': [absolute('base', 'core')],
      'src/base/core.py': baseImports,
      'src/other/o.py': [absolute('feature', 'a')],
    });
    const typeOnly = { ...absolute('other', 'o'), typeOnly: true };
    const stabilityEdges = (imports) =>
      analyzePythonCoupling({ modules: inversion, imports }).stabilityDirection.map(
        ({ source, target }) => `${source}>${target}`,
      );

    it('does not make the stability rule see a dependency only the type checker needs', () => {
      expect(stabilityEdges(importsWith(typeOnly))).toEqual([]);
    });

    it('still flags the dependency when the same module is also imported at run time', () => {
      expect(stabilityEdges(importsWith(typeOnly, absolute('other', 'o')))).toEqual(['base>other']);
    });

    it('keeps the type-only dependency in the report-only metrics', () => {
      const withTypeOnly = analyzePythonCoupling({
        modules: inversion,
        imports: importsWith(typeOnly),
      });
      const without = analyzePythonCoupling({ modules: inversion, imports: importsWith() });

      expect(withTypeOnly.summary.dependencies).toBe(without.summary.dependencies + 1);
      expect(withTypeOnly.modules.find(({ file }) => file === 'src/base/core.py')).toEqual({
        file: 'src/base/core.py',
        fanIn: 2,
        fanOut: 1,
        totalCoupling: 3,
        instability: 0.3333,
      });
    });

    it('reports no enforceable finding', () => {
      const reportRoot = temporaryRoot();
      writeFileSync(
        path.join(reportRoot, 'imports.json'),
        JSON.stringify({ modules: inversion, imports: importsWith(typeOnly) }),
      );

      expect(
        readCouplingFindings(reportRoot).filter(
          ({ classification }) => classification === 'enforceable',
        ),
      ).toEqual([]);
    });
  });

  it('reports a stability inversion on the source package with the way to lift it', () => {
    const reportRoot = temporaryRoot();
    writeFileSync(
      path.join(reportRoot, 'imports.json'),
      JSON.stringify({
        modules: [
          module('base', { isPackage: true }),
          module('base.core'),
          module('feature'),
          module('feature.a'),
          module('feature.b'),
          module('other', { isPackage: true }),
          module('other.o'),
        ],
        imports: {
          'src/feature/a.py': [absolute('base', 'core')],
          'src/feature/b.py': [absolute('base', 'core')],
          'src/base/core.py': [absolute('other', 'o')],
          'src/other/o.py': [absolute('feature', 'a')],
        },
      }),
    );

    const [finding, ...others] = readCouplingFindings(reportRoot).filter(
      ({ classification }) => classification === 'enforceable',
    );

    expect(others).toEqual([]);
    expect(finding).toEqual({
      tool: 'coupling',
      rule: 'stability-direction',
      path: 'src/base/__init__.py',
      identity: 'package-edge:base->other',
      message:
        'base depends on less stable package other. Depend on an abstraction in a more stable package instead, or, if the inversion is intended, add src/base/__init__.py to "exclude" in nitpicker.config.json.',
      classification: 'enforceable',
    });
  });

  it('puts a package without an __init__ on its first file', () => {
    const reportRoot = temporaryRoot();
    writeFileSync(
      path.join(reportRoot, 'imports.json'),
      JSON.stringify({
        modules: [
          module('base.zeta'),
          module('base.alpha'),
          module('feature.a'),
          module('feature.b'),
          module('other.o'),
        ],
        imports: {
          'src/feature/a.py': [absolute('base', 'alpha')],
          'src/feature/b.py': [absolute('base', 'alpha')],
          'src/base/zeta.py': [absolute('other', 'o')],
          'src/other/o.py': [absolute('feature', 'a')],
        },
      }),
    );

    expect(
      readCouplingFindings(reportRoot)
        .filter(({ rule }) => rule === 'stability-direction')
        .map(({ path: file }) => file),
    ).toEqual(['src/base/alpha.py']);
  });

  it('reports findings against the coupling tool', () => {
    const reportRoot = temporaryRoot();
    writeFileSync(path.join(reportRoot, 'imports.json'), JSON.stringify({ modules, imports }));

    const findings = readCouplingFindings(reportRoot);

    expect(new Set(findings.map(({ tool }) => tool))).toEqual(new Set(['coupling']));
    expect(findings.filter(({ classification }) => classification === 'enforceable')).toEqual([]);
    expect(findings.filter(({ identity }) => identity === 'package:app.domain:fanOut')).toEqual([
      {
        tool: 'coupling',
        rule: 'package-coupling',
        path: '.',
        identity: 'package:app.domain:fanOut',
        message: 'fanOut for package app.domain',
        classification: 'descriptive',
        metric: { name: 'fanOut', value: 1 },
      },
    ]);
  });
});

describe('scanning imports with the project interpreter', () => {
  function scanContext(files) {
    const projectRoot = temporaryRoot();
    for (const file of files) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), '');
    }
    return { projectRoot, reportRoot: temporaryRoot(), project: { sourceRoots: ['src'] } };
  }

  it('asks the interpreter to scan the production modules and stores the answer', () => {
    const context = scanContext(['src/app/a.py', 'src/app/test_a.py']);
    const calls = [];
    const run = (_, command, options) => {
      calls.push({
        command,
        options,
        request: JSON.parse(readFileSync(command.at(-1), 'utf8')),
      });
      return { stdout: '{"src/app/a.py":[{"level":0,"module":null,"names":["os"]}]}' };
    };

    scanImports(context, run);

    expect(calls).toHaveLength(1);
    expect(calls[0].command.slice(0, 2)).toEqual(['python', '-I']);
    expect(calls[0].command[2]).toMatch(/import-scan\.py$/);
    expect(calls[0].options).toEqual({ rule: 'coupling-failed' });
    expect(calls[0].request).toEqual({ root: context.projectRoot, files: ['src/app/a.py'] });
    expect(JSON.parse(readFileSync(path.join(context.reportRoot, 'imports.json'), 'utf8'))).toEqual(
      {
        modules: [{ file: 'src/app/a.py', module: 'app.a', isPackage: false }],
        imports: { 'src/app/a.py': [{ level: 0, module: null, names: ['os'] }] },
      },
    );
  });

  it('does not start the interpreter when there is nothing to scan', () => {
    const context = scanContext([]);

    scanImports(context, () => {
      throw new Error('should not run');
    });

    expect(JSON.parse(readFileSync(path.join(context.reportRoot, 'imports.json'), 'utf8'))).toEqual(
      { modules: [], imports: {} },
    );
  });
});
