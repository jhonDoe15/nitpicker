import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { collectImports } from '../analysis/python-coupling.mjs';
import { pythonFeatureAnalysis, pythonImportFacts } from './python-feature-facts.mjs';
import { cycleFindings } from './python-import-rules.mjs';

const FEATURES = 'src/app/features';

const module = (name, isPackage = false) => ({
  module: name,
  file: `src/${name.replaceAll('.', '/')}${isPackage ? '/__init__' : ''}.py`,
  isPackage,
});
const absolute = (from, ...names) => ({ level: 0, module: from, names });

const MODULES = [
  module('app.features.billing', true),
  module('app.features.billing._rates'),
  module('app.features.billing.internal', true),
  module('app.features.billing.internal.tax'),
  module('app.features.orders.cart'),
];

function edgesOf(file, ...statements) {
  return pythonImportFacts({ modules: MODULES, imports: { [file]: statements } }).imports;
}

describe('the import facts of the Python scan', () => {
  it('lists every production module and resolves each statement to file edges', () => {
    const facts = pythonImportFacts({ modules: MODULES, imports: {} });

    expect(facts.modules.slice(0, 2)).toEqual([
      {
        file: `${FEATURES}/billing/__init__.py`,
        role: 'production',
        generated: false,
        initializer: true,
      },
      {
        file: `${FEATURES}/billing/_rates.py`,
        role: 'production',
        generated: false,
        initializer: false,
      },
    ]);
    expect(facts.imports).toEqual([]);
  });

  it('tells a submodule from a name and keeps the aliased whole-module import', () => {
    expect(
      edgesOf(
        `${FEATURES}/orders/cart.py`,
        absolute('app.features.billing', '_rates', 'Invoice'),
        absolute(null, 'app.features.billing.internal.tax'),
      ).map(({ to, names }) => [to, names]),
    ).toEqual([
      [`${FEATURES}/billing/_rates.py`, [{ name: '*' }]],
      [`${FEATURES}/billing/__init__.py`, [{ name: 'Invoice' }]],
      [`${FEATURES}/billing/internal/tax.py`, [{ name: '*' }]],
    ]);
  });

  it('resolves relative imports and marks re-exports and type-only imports', () => {
    const [reexport, typeOnly] = edgesOf(
      `${FEATURES}/billing/__init__.py`,
      { level: 1, module: '_rates', names: ['rate', '_hidden'] },
      { level: 2, module: 'orders.cart', names: ['Cart'], typeOnly: true },
    );

    expect(reexport).toEqual({
      from: `${FEATURES}/billing/__init__.py`,
      to: `${FEATURES}/billing/_rates.py`,
      names: [{ name: 'rate' }, { name: '_hidden' }],
      reexport: true,
      typeOnly: false,
    });
    expect(typeOnly).toEqual({
      from: `${FEATURES}/billing/__init__.py`,
      to: `${FEATURES}/orders/cart.py`,
      names: [{ name: 'Cart' }],
      reexport: false,
      typeOnly: true,
    });
  });

  it('leaves out imports of the module itself and of code outside the sources', () => {
    expect(
      edgesOf(
        `${FEATURES}/billing/__init__.py`,
        { level: 1, module: null, names: ['VERSION'] },
        absolute('requests', 'get'),
      ),
    ).toEqual([]);
  });

  it('marks generated modules and keeps their imports for the shared rules to skip', () => {
    const facts = pythonImportFacts(
      {
        modules: MODULES,
        imports: { [`${FEATURES}/orders/cart.py`]: [absolute('app.features.billing', '_rates')] },
      },
      { isGenerated: (file) => file.endsWith('cart.py') },
    );

    expect(facts.modules.filter(({ generated }) => generated).map(({ file }) => file)).toEqual([
      `${FEATURES}/orders/cart.py`,
    ]);
    expect(facts.imports.map(({ from, to }) => [from, to])).toEqual([
      [`${FEATURES}/orders/cart.py`, `${FEATURES}/billing/_rates.py`],
    ]);
  });

  it('turns the __all__ list of a package into whole-module re-exports of its sub-packages', () => {
    const [exported] = edgesOf(`${FEATURES}/billing/__init__.py`, {
      level: 1,
      module: null,
      names: ['internal', 'Invoice'],
      typeOnly: true,
      exported: true,
    });

    expect(exported).toEqual({
      from: `${FEATURES}/billing/__init__.py`,
      to: `${FEATURES}/billing/internal/__init__.py`,
      names: [{ name: '*' }],
      reexport: true,
      typeOnly: true,
    });
  });
});

const CYCLE_MODULES = [
  module('app.features.billing', true),
  module('app.features.billing.a'),
  module('app.features.shipping', true),
  module('app.features.shipping.b'),
  module('app.features.shipping.b2'),
  module('app.util', true),
  module('app.util.u'),
];

function cycleReport(throughUtil) {
  const billing = [absolute('app.features.shipping', 'b')];
  return {
    modules: CYCLE_MODULES,
    imports: {
      [`${FEATURES}/billing/a.py`]: throughUtil ? [...billing, absolute('app.util', 'u')] : billing,
      [`${FEATURES}/shipping/b.py`]: [absolute('app.features.billing', 'a')],
      'src/app/util/u.py': [absolute('app.features.shipping', 'b2')],
      [`${FEATURES}/shipping/b2.py`]: [absolute('app.features.billing', 'a')],
    },
  };
}

function packageCycles(report, policy) {
  return cycleFindings(report, pythonFeatureAnalysis(report, { policy })).map(
    ({ identity }) => identity,
  );
}

describe('package cycles next to feature cycles', () => {
  it('drops a package cycle between feature packages the feature cycle reports', () => {
    expect(packageCycles(cycleReport(false))).toEqual([]);
  });

  it('keeps a package cycle that runs through a package outside the features', () => {
    expect(packageCycles(cycleReport(true))).toEqual([
      'cycle:app.features.billing',
      'cycle:app.features.shipping',
      'cycle:app.util',
    ]);
  });

  it('keeps the package cycle when an exception drops the feature cycle', () => {
    const policy = { exceptions: [{ rule: 'feature-cycle', paths: ['src/**'], reason: 'test' }] };

    expect(packageCycles(cycleReport(false), policy)).toEqual([
      'cycle:app.features.billing',
      'cycle:app.features.shipping',
    ]);
  });
});

describe('foreign-feature-persistence over the Python facts', () => {
  it('follows a name the feature __init__ re-exports from its repository module', () => {
    const modules = [
      module('app.features.billing', true),
      module('app.features.billing.repository'),
      module('app.features.orders.cart'),
    ];
    const imports = {
      [`${FEATURES}/billing/__init__.py`]: [
        { level: 1, module: 'repository', names: ['InvoiceRepository'] },
      ],
      [`${FEATURES}/orders/cart.py`]: [absolute('app.features.billing', 'InvoiceRepository')],
    };
    const persistence = new Map([[`${FEATURES}/billing/repository.py`, 'data-access']]);

    const { findings } = pythonFeatureAnalysis({ modules, imports }, { persistence });

    expect(findings.map(({ rule, path: file, identity }) => [rule, file, identity])).toEqual([
      [
        'foreign-feature-persistence',
        `${FEATURES}/orders/cart.py`,
        `foreign-persistence:${FEATURES}/billing/repository.py`,
      ],
    ]);
  });
});

const SCAN_TIMEOUT_MS = 30_000;
const fixture = path.resolve(import.meta.dirname, '../fixtures/feature-project');
const reportRoots = [];

afterAll(() => {
  for (const root of reportRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scanFixture() {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-features-'));
  reportRoots.push(reportRoot);
  const run = (_, [, ...args]) => {
    const scanned = spawnSync('python3', args, { encoding: 'utf8', timeout: SCAN_TIMEOUT_MS });
    expect(scanned.status).toBe(0);
    return scanned;
  };
  return collectImports(
    { projectRoot: fixture, reportRoot, project: { sourceRoots: ['src'] } },
    run,
  );
}

describe.skipIf(!pythonUsable())('the feature rules on a scanned project', () => {
  let report;
  beforeAll(() => {
    report = scanFixture();
  });
  const rows = (findings) =>
    findings.map(({ rule, path: file, identity }) => [rule, file, identity]);

  it('reports internal imports, shared code importing a feature and the feature cycle', () => {
    expect(rows(pythonFeatureAnalysis(report).findings)).toEqual([
      ['feature-cycle', `${FEATURES}/billing/invoice.py`, `${FEATURES}/shipping|feature-cycle`],
      [
        'feature-internal-import',
        `${FEATURES}/orders/cart.py`,
        `feature-internal:${FEATURES}/billing/internal/tax.py`,
      ],
      ['feature-cycle', `${FEATURES}/shipping/api.py`, `${FEATURES}/billing|feature-cycle`],
      [
        'feature-internal-import',
        'src/app/main.py',
        `feature-internal:${FEATURES}/billing/_rates.py`,
      ],
      ['shared-used-by-one-feature', 'src/app/shared/ids.py', 'shared-used-by-one-feature'],
      [
        'shared-imports-feature',
        'src/app/shared/money.py',
        `${FEATURES}/billing|shared-imports-feature`,
      ],
    ]);
  });

  it('drops the package cycle the feature cycle already reports', () => {
    expect(cycleFindings(report).map(({ identity }) => identity)).toEqual([
      'cycle:app.features.billing',
      'cycle:app.features.shipping',
    ]);
    expect(cycleFindings(report, pythonFeatureAnalysis(report))).toEqual([]);
  });

  it('follows the layout and the exceptions of the head policy', () => {
    const policy = {
      layout: { featureRoots: ['src/app/modules'] },
      exceptions: [{ rule: 'feature-cycle', paths: ['src/**'], reason: 'test' }],
    };

    expect(pythonFeatureAnalysis(report, { policy }).findings).toEqual([]);
    expect(
      rows(
        pythonFeatureAnalysis(report, { policy: { exceptions: policy.exceptions } }).findings,
      ).map(([rule]) => rule),
    ).not.toContain('feature-cycle');
  });
});
