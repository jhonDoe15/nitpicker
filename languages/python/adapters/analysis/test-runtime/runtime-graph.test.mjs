import { describe, expect, it } from 'vitest';
import {
  absolute,
  analyze,
  categories,
  other,
  plain,
  productionAt,
  relative,
  scanned,
} from './test-support/runtime-data.mjs';

describe('reaching production code at runtime', () => {
  it('counts a direct import', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [absolute('app.service', 'run')] },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'direct-production-runtime' });
    expect(report.findings).toEqual([]);
  });

  it('follows a helper the test imports', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/helpers.py')],
      imports: {
        'tests/test_a.py': [absolute('tests.helpers', 'build')],
        'tests/helpers.py': [absolute('app.service', 'run')],
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('follows a helper imported by its bare name, as pytest puts the test folder on the path', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/helpers.py')],
      imports: {
        'tests/test_a.py': [plain('helpers')],
        'tests/helpers.py': [absolute('app.service', 'run')],
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('resolves a relative import of a helper in a test package', () => {
    const report = analyze({
      others: [
        other('tests/__init__.py', 'other'),
        other('tests/test_a.py'),
        other('tests/helpers.py'),
      ],
      imports: {
        'tests/test_a.py': [relative(1, 'helpers', 'build')],
        'tests/helpers.py': [absolute('app.client', 'Client')],
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });
});

describe('imports from a test folder without __init__.py', () => {
  const unit = [other('app/tests/test_m.py')];

  it('does not link a test that imports only the standard library to the package around it', () => {
    const report = analyze({
      modules: [productionAt('app/__init__.py')],
      others: unit,
      imports: { 'app/tests/test_m.py': [plain('os')] },
    });

    expect(categories(report)).toEqual({ 'app/tests/test_m.py': 'no-production-runtime' });
    expect(report.findings).toHaveLength(1);
  });

  it('does not link a test below a package folder to that package through its __init__.py', () => {
    const report = analyze({
      modules: [productionAt('app/__init__.py')],
      others: [other('tests/__init__.py', 'other'), other('tests/unit/test_m.py')],
      imports: {
        'tests/__init__.py': [plain('app')],
        'tests/unit/test_m.py': [plain('os')],
      },
    });

    expect(categories(report)).toEqual({ 'tests/unit/test_m.py': 'no-production-runtime' });
  });

  it('links a test to a module that exists beside it', () => {
    const report = analyze({
      modules: [productionAt('app/__init__.py')],
      others: [...unit, other('app/tests/helpers.py')],
      imports: {
        'app/tests/test_m.py': [plain('helpers')],
        'app/tests/helpers.py': [absolute('app', 'run')],
      },
    });

    expect(categories(report)).toEqual({ 'app/tests/test_m.py': 'transitive-production-runtime' });
  });

  it('prefers a module beside the test to a production module of the same name', () => {
    const modules = [productionAt('utils.py')];
    const imports = { 'tests/test_a.py': [plain('utils')], 'tests/utils.py': [] };

    expect(
      categories(
        analyze({ modules, others: [other('tests/test_a.py'), other('tests/utils.py')], imports }),
      ),
    ).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
    expect(categories(analyze({ modules, others: [other('tests/test_a.py')], imports }))).toEqual({
      'tests/test_a.py': 'direct-production-runtime',
    });
  });

  it('keeps a from-import of a production module beside a sibling of another name', () => {
    const report = analyze({
      modules: [productionAt('utils.py')],
      others: [other('tests/test_a.py'), other('tests/helpers.py')],
      imports: { 'tests/test_a.py': [absolute('utils', 'run')], 'tests/helpers.py': [] },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'direct-production-runtime' });
  });
});

describe('string literals that name a production module', () => {
  it('counts an import_module argument and a patch target as dynamic edges', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/test_b.py')],
      imports: { 'tests/test_a.py': [], 'tests/test_b.py': [] },
      literals: {
        'tests/test_a.py': scanned({ strings: ['app.client'] }),
        'tests/test_b.py': scanned({ strings: ['app.service.requests', 'os.path'] }),
      },
    });

    expect(categories(report)).toEqual({
      'tests/test_a.py': 'dynamic-production-runtime',
      'tests/test_b.py': 'dynamic-production-runtime',
    });
    expect(report.tests[1].directProductionModules).toEqual(['src/app/service.py']);
  });

  it('follows a literal in a helper the test reaches', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/helpers.py')],
      imports: { 'tests/test_a.py': [absolute('tests.helpers', 'load')], 'tests/helpers.py': [] },
      literals: { 'tests/helpers.py': scanned({ strings: ['app.service'] }) },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('ignores a literal that names no module of the project', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [plain('os')] },
      literals: { 'tests/test_a.py': scanned({ strings: ['os.path', 'application.service'] }) },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });
});
