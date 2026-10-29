import { describe, expect, it } from 'vitest';
import {
  absolute,
  analyze,
  categories,
  other,
  plain,
  relative,
  CLIENT,
  SERVICE,
} from './test-support/runtime-data.mjs';
import { buildRuntimeGraph } from './runtime-graph.mjs';

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

describe('conftest.py and pytest_plugins', () => {
  const others = [
    other('tests/unit/test_a.py'),
    other('tests/conftest.py'),
    other('tests/api/conftest.py'),
    other('tests/api/test_c.py'),
  ];
  const imports = {
    'tests/unit/test_a.py': [],
    'tests/api/test_c.py': [],
    'tests/conftest.py': [absolute('app.service', 'run')],
    'tests/api/conftest.py': [absolute('app.client', 'Client')],
  };

  it('reaches the conftest.py files above the test, and only those', () => {
    const edges = buildRuntimeGraph({
      modules: [SERVICE, CLIENT],
      others,
      imports,
      loadsConftest: true,
    });

    expect(edges.get('tests/unit/test_a.py')).toEqual([
      { target: 'tests/conftest.py', kind: 'runtime', dynamic: undefined },
    ]);
    expect(edges.get('tests/api/test_c.py')).toEqual([
      { target: 'tests/api/conftest.py', kind: 'runtime', dynamic: undefined },
      { target: 'tests/conftest.py', kind: 'runtime', dynamic: undefined },
    ]);
  });

  it('reaches production through them', () => {
    const report = analyze({ others, imports });

    expect(
      report.tests.map(({ test, runtimeProductionModules }) => [test, runtimeProductionModules]),
    ).toEqual([
      ['tests/api/test_c.py', ['src/app/client.py', 'src/app/service.py']],
      ['tests/unit/test_a.py', ['src/app/service.py']],
    ]);
  });

  it('reaches a conftest.py at the project root', () => {
    const report = analyze({
      others: [other('conftest.py'), other('tests/test_a.py')],
      imports: { 'conftest.py': [absolute('app.service', 'run')], 'tests/test_a.py': [] },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('loads no conftest.py when the project does not run pytest', () => {
    const report = analyze({
      others: [other('conftest.py'), other('tests/test_a.py')],
      imports: { 'conftest.py': [absolute('app.service', 'run')], 'tests/test_a.py': [] },
      runner: 'unittest',
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });

  it('follows a module a conftest.py names in pytest_plugins', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/conftest.py'), other('tests/plugin.py')],
      imports: {
        'tests/test_a.py': [],
        'tests/conftest.py': [],
        'tests/plugin.py': [absolute('app.client', 'Client')],
      },
      literals: { 'tests/conftest.py': { strings: [], plugins: ['tests.plugin'] } },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('counts a production module named in pytest_plugins as a dynamic edge', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [] },
      literals: { 'tests/test_a.py': { strings: [], plugins: ['app.client'] } },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'dynamic-production-runtime' });
  });
});

describe('string literals that name a production module', () => {
  it('counts an import_module argument and a patch target as dynamic edges', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/test_b.py')],
      imports: { 'tests/test_a.py': [], 'tests/test_b.py': [] },
      literals: {
        'tests/test_a.py': { strings: ['app.client'], plugins: [] },
        'tests/test_b.py': { strings: ['app.service.requests', 'os.path'], plugins: [] },
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
      literals: { 'tests/helpers.py': { strings: ['app.service'], plugins: [] } },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('ignores a literal that names no module of the project', () => {
    const report = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [plain('os')] },
      literals: { 'tests/test_a.py': { strings: ['os.path', 'application.service'], plugins: [] } },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });
});
