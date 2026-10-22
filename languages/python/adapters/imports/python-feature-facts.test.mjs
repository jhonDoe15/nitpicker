import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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

    expect(facts.modules[0]).toEqual({
      file: `${FEATURES}/billing/__init__.py`,
      role: 'production',
    });
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
    expect(typeOnly).toMatchObject({ to: `${FEATURES}/orders/cart.py`, typeOnly: true });
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

  it('leaves out the imports of generated modules', () => {
    const facts = pythonImportFacts(
      {
        modules: MODULES,
        imports: { [`${FEATURES}/orders/cart.py`]: [absolute('app.features.billing', '_rates')] },
      },
      (file) => file.endsWith('cart.py'),
    );

    expect(facts.imports).toEqual([]);
  });
});

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
    const scanned = spawnSync('python3', args, { encoding: 'utf8' });
    expect(scanned.status).toBe(0);
    return scanned;
  };
  return collectImports(
    { projectRoot: fixture, reportRoot, project: { sourceRoots: ['src'] } },
    run,
  );
}

let scanned;

describe.skipIf(!pythonUsable())('the feature rules on a scanned project', () => {
  const scannedReport = () => {
    scanned ??= scanFixture();
    return scanned;
  };
  const rows = (findings) =>
    findings.map(({ rule, path: file, identity }) => [rule, file, identity]);

  it('reports internal imports, shared code importing a feature and the feature cycle', () => {
    expect(rows(pythonFeatureAnalysis(scannedReport()).findings)).toEqual([
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
    const report = scannedReport();
    const { cycleEdges } = pythonFeatureAnalysis(report);

    expect(cycleFindings(report).map(({ identity }) => identity)).toEqual([
      'cycle:app.features.billing',
      'cycle:app.features.shipping',
    ]);
    expect(cycleFindings(report, cycleEdges)).toEqual([]);
  });

  it('follows the layout and the exceptions of the head policy', () => {
    const policy = {
      layout: { featureRoots: ['src/app/modules'] },
      exceptions: [{ rule: 'feature-cycle', paths: ['src/**'], reason: 'test' }],
    };

    const report = scannedReport();

    expect(pythonFeatureAnalysis(report, { policy }).findings).toEqual([]);
    expect(
      rows(
        pythonFeatureAnalysis(report, { policy: { exceptions: policy.exceptions } }).findings,
      ).map(([rule]) => rule),
    ).not.toContain('feature-cycle');
  });
});
