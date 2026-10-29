import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { probedTops, unresolvedImportFindings } from './unresolved-imports.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function directory(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-unresolved-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const FILES = {
  'src/app/__init__.py': '',
  'src/app/orders.py': '',
  'src/app/billing/__init__.py': '',
  'src/app/billing/invoice.py': '',
  'src/app/native/_speedups.cpython-312-x86_64-linux-gnu.so': '',
  'src/app/data/schema.json': '{}',
  'tests/__init__.py': '',
  'tests/helpers.py': '',
  'tests/test_orders.py': '',
  'noxfile.py': '',
};
const MODULES = [
  { file: 'src/app/__init__.py', module: 'app', isPackage: true },
  { file: 'src/app/orders.py', module: 'app.orders', isPackage: false },
  { file: 'src/app/billing/__init__.py', module: 'app.billing', isPackage: true },
  { file: 'src/app/billing/invoice.py', module: 'app.billing.invoice', isPackage: false },
  { file: 'noxfile.py', module: 'noxfile', isPackage: false },
];
const OTHERS = [
  { file: 'tests/__init__.py', module: 'tests', kind: 'other', inRoots: false },
  { file: 'tests/helpers.py', module: 'tests.helpers', kind: 'other', inRoots: false },
  { file: 'tests/test_orders.py', module: 'tests.test_orders', kind: 'test', inRoots: false },
];
const SCAN = {
  stdlib: ['os', 'json', 'logging'],
  modules: { requests: ['requests'], yaml: ['PyYAML'] },
  importable: ['editable_tool'],
};
const DECLARED = {
  manifest: 'pyproject.toml',
  dependencies: [
    { name: 'scikit-learn', normalized: 'scikit-learn', group: 'optional' },
    { name: 'markdown-it-py', normalized: 'markdown-it-py', group: 'production' },
    { name: 'python-dateutil', normalized: 'python-dateutil', group: 'optional' },
  ],
};

const plain = (names, line = 1) => ({ level: 0, module: null, names, line });
const from = (module, names = ['x'], line = 1) => ({ level: 0, module, names, line });
const relative = (level, module, names = ['x'], line = 1) => ({ level, module, names, line });

function findingsFor(
  imports,
  { files = FILES, scan = SCAN, modules = MODULES, others = OTHERS, declared = DECLARED } = {},
) {
  return unresolvedImportFindings({
    projectRoot: directory(files),
    imports: { modules, others, imports },
    scan,
    declared,
  });
}

function summary(findings) {
  return findings.map(({ path: file, identity, location }) => [file, identity, location?.line]);
}

describe('Python unresolved imports', () => {
  it('resolves the standard library, installed packages, project files and declared names', () => {
    const imports = {
      'src/app/orders.py': [
        plain(['os', 'json', 'requests', 'yaml.loader', 'editable_tool', 'scikit_learn']),
        plain(['markdown_it.token', 'dateutil']),
        from('__future__', ['annotations']),
        from('app.billing.invoice'),
        from('app.billing', ['invoice']),
        plain(['app.native._speedups', 'app.data']),
        relative(1, 'billing.invoice'),
        relative(1, null, ['anything']),
        from('logging.handlers'),
      ],
      'tests/test_orders.py': [from('tests.helpers'), plain(['helpers']), from('app.orders')],
    };

    expect(findingsFor(imports)).toEqual([]);
  });
  it('reports an unknown top-level name and a missing project module, once per file', () => {
    const imports = {
      'src/app/orders.py': [
        plain(['reqeusts'], 3),
        from('app.payments', ['charge'], 4),
        plain(['app.billing.refunds'], 5),
        plain(['app.orders.sub'], 6),
        relative(1, 'missing', ['x'], 7),
        relative(2, 'nowhere', ['x'], 8),
        plain(['reqeusts'], 9),
      ],
      'tests/test_orders.py': [from('tests.fixtures', ['make'], 2)],
    };

    expect(summary(findingsFor(imports))).toEqual([
      ['src/app/orders.py', 'unresolved:reqeusts', 3],
      ['src/app/orders.py', 'unresolved:app.payments', 4],
      ['src/app/orders.py', 'unresolved:app.billing.refunds', 5],
      ['src/app/orders.py', 'unresolved:app.orders.sub', 6],
      ['src/app/orders.py', 'unresolved:.missing', 7],
      ['src/app/orders.py', 'unresolved:..nowhere', 8],
      ['tests/test_orders.py', 'unresolved:tests.fixtures', 2],
    ]);
  });
  it('names the fix for an absolute and a relative import', () => {
    const imports = {
      'src/app/orders.py': [plain(['reqeusts'], 3), relative(1, 'missing', ['x'], 7)],
    };

    expect(findingsFor(imports)).toEqual([
      {
        tool: 'dependencies',
        rule: 'unresolved-import',
        path: 'src/app/orders.py',
        identity: 'unresolved:reqeusts',
        classification: 'enforceable',
        location: { line: 3 },
        message:
          'Import reqeusts resolves to no module or package. Fix the module name, or install the package and list it in pyproject.toml',
      },
      {
        tool: 'dependencies',
        rule: 'unresolved-import',
        path: 'src/app/orders.py',
        identity: 'unresolved:.missing',
        classification: 'enforceable',
        location: { line: 7 },
        message: 'Import .missing resolves to no module or package. Fix the module path',
      },
    ]);
  });
  it('skips type-only and guarded imports, tool-run files and files that are not tests', () => {
    const imports = {
      'src/app/orders.py': [
        { ...plain(['_typeshed']), typeOnly: true },
        { ...plain(['ujson']), guarded: true },
      ],
      'noxfile.py': [plain(['nox'])],
      'tests/helpers.py': [plain(['missing_helper'])],
      'tests/test_orders.py': [{ ...plain(['written_by_the_test']), local: true }],
    };

    expect(findingsFor(imports)).toEqual([]);
  });
  it('checks a function-local import in production code', () => {
    const imports = { 'src/app/orders.py': [{ ...plain(['reqeusts']), local: true }] };

    expect(summary(findingsFor(imports))).toEqual([
      ['src/app/orders.py', 'unresolved:reqeusts', 1],
    ]);
  });
  it('trusts a package or module that rewires the module path', () => {
    const files = {
      ...FILES,
      'src/app/__init__.py': '__path__ = extend_path(__path__, __name__)\n',
    };
    const aliased = { ...FILES, 'src/app/orders.py': 'sys.modules["app.orders.legacy"] = x\n' };

    expect(findingsFor({ 'src/app/orders.py': [from('app.plugins')] }, { files })).toEqual([]);
    expect(
      findingsFor(
        { 'src/app/billing/invoice.py': [from('app.orders.legacy')] },
        { files: aliased },
      ),
    ).toEqual([]);
  });
  it('checks nothing without the environment probe of an older scan', () => {
    const scan = { stdlib: SCAN.stdlib, modules: SCAN.modules };

    expect(findingsFor({ 'src/app/orders.py': [plain(['reqeusts'])] }, { scan })).toEqual([]);
  });
  it('lists the top-level names to probe in the environment', () => {
    expect(
      probedTops({
        imports: {
          'a.py': [
            plain(['b.c', 'os']),
            from('requests.adapters'),
            relative(1, 'local'),
            { ...plain(['typed']), typeOnly: true },
            { ...plain(['optional']), guarded: true },
          ],
        },
      }),
    ).toEqual(['b', 'os', 'requests']);
  });
  it('leaves test data, tool configuration and tool-run files alone', () => {
    const others = [
      ...OTHERS,
      { file: 'tests/data/test_sample.py', module: 'tests.data.test_sample', kind: 'test' },
      {
        file: 'tests/fixtures/pkg/main_test.py',
        module: 'tests.fixtures.pkg.main_test',
        kind: 'test',
      },
    ];
    const modules = [
      ...MODULES,
      { file: 'website/conf.py', module: 'website.conf', isPackage: false },
      { file: 'hatch_build.py', module: 'hatch_build', isPackage: false },
      { file: 'tasks.py', module: 'tasks', isPackage: false },
    ];
    const imports = Object.fromEntries(
      [...others, ...modules].map(({ file }) => [file, [plain(['nowhere_to_be_found'])]]),
    );

    expect(summary(findingsFor(imports, { modules, others }))).toEqual([
      ['src/app/__init__.py', 'unresolved:nowhere_to_be_found', 1],
      ['src/app/orders.py', 'unresolved:nowhere_to_be_found', 1],
      ['src/app/billing/__init__.py', 'unresolved:nowhere_to_be_found', 1],
      ['src/app/billing/invoice.py', 'unresolved:nowhere_to_be_found', 1],
      ['tests/test_orders.py', 'unresolved:nowhere_to_be_found', 1],
    ]);
  });
  it('matches a declared or build requirement whose import name differs', () => {
    const declared = {
      manifest: 'pyproject.toml',
      dependencies: ['pillow', 'opencv-python-headless', 'pywin32', 'django-environ'].map(
        (name) => ({ name, normalized: name, group: 'optional' }),
      ),
    };
    const files = {
      ...FILES,
      'pyproject.toml': '[build-system]\nrequires = ["hatchling>=1.20", "hatch-vcs"]\n',
    };
    const imports = {
      'src/app/orders.py': [
        plain(['PIL.Image', 'cv2', 'win32api', 'pywintypes', 'environ', 'hatchling']),
        plain(['sklearn'], 2),
      ],
    };

    expect(summary(findingsFor(imports, { files, declared }))).toEqual([
      ['src/app/orders.py', 'unresolved:sklearn', 2],
    ]);
  });
  it('trusts generated modules, and compiled modules when the project builds extensions', () => {
    const imports = {
      'src/app/orders.py': [
        from('app._version'),
        relative(1, '_version'),
        from('app.billing.invoice_pb2'),
        from('app._core', ['add'], 4),
        from('app.native.missing.deep', ['x'], 5),
      ],
    };
    const compiled = {
      ...FILES,
      'pyproject.toml': '[build-system]\nrequires = ["meson-python", "numpy"]\n',
    };

    expect(summary(findingsFor(imports))).toEqual([
      ['src/app/orders.py', 'unresolved:app._core', 4],
      ['src/app/orders.py', 'unresolved:app.native.missing.deep', 5],
    ]);
    expect(summary(findingsFor(imports, { files: compiled }))).toEqual([
      ['src/app/orders.py', 'unresolved:app.native.missing.deep', 5],
    ]);
  });
  it('finds a compiled module beside the importing file or above it', () => {
    const files = { ...FILES, 'fast_ext.cpython-312-x86_64-linux-gnu.so': '' };

    expect(findingsFor({ 'tests/test_orders.py': [plain(['fast_ext'])] }, { files })).toEqual([]);
  });
  it('resolves a package spread over several source roots', () => {
    const files = {
      'services/a/app/__init__.py': '',
      'services/a/app/x.py': '',
      'services/b/app/__init__.py': '',
      'services/b/app/y.py': '',
      'services/b/app/z.py': '',
    };
    const modules = [
      { file: 'services/a/app/__init__.py', module: 'app', isPackage: true },
      { file: 'services/a/app/x.py', module: 'app.x', isPackage: false },
      { file: 'services/b/app/y.py', module: 'app.y', isPackage: false },
      { file: 'services/b/app/z.py', module: 'app.z', isPackage: false },
    ];
    const imports = {
      'services/b/app/y.py': [from('app.z'), from('app.x'), from('app.w', ['q'], 3)],
    };

    expect(summary(findingsFor(imports, { files, modules, others: [] }))).toEqual([
      ['services/b/app/y.py', 'unresolved:app.w', 3],
    ]);
  });
  it('checks only project modules in an environment with nothing installed', () => {
    const scan = { ...SCAN, modules: {} };
    const imports = { 'src/app/orders.py': [plain(['requests', 'app.gone'], 2)] };

    expect(summary(findingsFor(imports, { scan }))).toEqual([
      ['src/app/orders.py', 'unresolved:app.gone', 2],
    ]);
  });
  it('reports a file listed twice once, and leaves a relative import above the top package alone', () => {
    const modules = [
      ...MODULES,
      { file: 'src/app/orders.py', module: 'src.app.orders', isPackage: false },
    ];
    const imports = { 'src/app/orders.py': [plain(['reqeusts'], 2), relative(3, 'far', ['x'])] };

    expect(summary(findingsFor(imports, { modules }))).toEqual([
      ['src/app/orders.py', 'unresolved:reqeusts', 2],
    ]);
  });
});
