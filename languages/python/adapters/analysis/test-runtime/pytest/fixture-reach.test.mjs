import { describe, expect, it } from 'vitest';
import {
  absolute,
  analyze,
  categories,
  fixture,
  other,
  productionAt,
  scanned,
  SERVICE,
} from '../test-support/runtime-data.mjs';

const PRODUCTION_IMPORT = { 'tests/conftest.py': [absolute('app.service', 'run')] };

function unit(literals, extra = {}) {
  return analyze({
    others: [other('tests/test_a.py'), other('tests/conftest.py'), ...(extra.others ?? [])],
    imports: { 'tests/test_a.py': [], ...PRODUCTION_IMPORT, ...extra.imports },
    literals,
    runner: extra.runner,
  });
}

describe('reaching a conftest.py through the fixtures a test uses', () => {
  it('does not count what a conftest.py imports when the test uses none of its fixtures', () => {
    const report = unit({
      'tests/conftest.py': scanned({ fixtures: [fixture('service')] }),
      'tests/test_a.py': scanned({ requests: ['other_fixture'] }),
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });

  it('counts a fixture the test takes as a parameter', () => {
    const report = unit({
      'tests/conftest.py': scanned({ fixtures: [fixture('service')] }),
      'tests/test_a.py': scanned({ requests: ['service'] }),
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('counts an autouse fixture the test does not name', () => {
    const report = unit({
      'tests/conftest.py': scanned({ fixtures: [fixture('boot', [], true)] }),
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('counts a fixture reached only through another fixture', () => {
    const report = analyze({
      others: [
        other('tests/conftest.py'),
        other('tests/api/conftest.py'),
        other('tests/api/test_c.py'),
      ],
      imports: { ...PRODUCTION_IMPORT, 'tests/api/conftest.py': [], 'tests/api/test_c.py': [] },
      literals: {
        'tests/conftest.py': scanned({ fixtures: [fixture('service')] }),
        'tests/api/conftest.py': scanned({ fixtures: [fixture('client', ['service'])] }),
        'tests/api/test_c.py': scanned({ requests: ['client'] }),
      },
    });

    expect(report.tests[0].runtimeProductionModules).toEqual(['src/app/service.py']);
  });

  it('uses the nearest definition, and the next one up when a fixture asks for its own name', () => {
    const others = [
      other('tests/conftest.py'),
      other('tests/api/conftest.py'),
      other('tests/api/test_c.py'),
    ];
    const imports = {
      'tests/conftest.py': [absolute('app.service', 'run')],
      'tests/api/conftest.py': [absolute('app.client', 'Client')],
      'tests/api/test_c.py': [],
    };
    const near = scanned({ fixtures: [fixture('thing')] });
    const far = scanned({ fixtures: [fixture('thing')] });
    const requests = scanned({ requests: ['thing'] });
    const modules = (literals) =>
      analyze({ others, imports, literals }).tests[0].runtimeProductionModules;

    expect(
      modules({
        'tests/conftest.py': far,
        'tests/api/conftest.py': near,
        'tests/api/test_c.py': requests,
      }),
    ).toEqual(['src/app/client.py']);
    expect(
      modules({
        'tests/conftest.py': far,
        'tests/api/conftest.py': scanned({ fixtures: [fixture('thing', ['thing'])] }),
        'tests/api/test_c.py': requests,
      }),
    ).toEqual(['src/app/client.py', 'src/app/service.py']);
  });

  it('counts a fixture the test file defines and the conftest.py fixture it asks for', () => {
    const report = unit({
      'tests/conftest.py': scanned({ fixtures: [fixture('service')] }),
      'tests/test_a.py': scanned({
        fixtures: [fixture('local', ['service'])],
        requests: ['local'],
      }),
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('counts a fixture a helper of the test asks for, as a base class of test methods does', () => {
    const report = unit(
      {
        'tests/conftest.py': scanned({ fixtures: [fixture('service')] }),
        'tests/base.py': scanned({ requests: ['service'] }),
      },
      {
        others: [other('tests/base.py')],
        imports: { 'tests/test_a.py': [absolute('tests.base', 'Base')], 'tests/base.py': [] },
      },
    );

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('counts a fixture a conftest.py gets from a module it imports', () => {
    const report = unit(
      {
        'tests/fixtures.py': scanned({ fixtures: [fixture('service')] }),
        'tests/test_a.py': scanned({ requests: ['service'] }),
      },
      {
        others: [other('tests/fixtures.py')],
        imports: {
          'tests/conftest.py': [absolute('tests.fixtures', 'service')],
          'tests/fixtures.py': [absolute('app.service', 'run')],
        },
      },
    );

    expect(report.tests[0].runtimeProductionModules).toEqual(['src/app/service.py']);
  });

  it('reaches a conftest.py at the project root', () => {
    const report = analyze({
      others: [other('conftest.py'), other('tests/test_a.py')],
      imports: { 'conftest.py': [absolute('app.service', 'run')], 'tests/test_a.py': [] },
      literals: {
        'conftest.py': scanned({ fixtures: [fixture('service')] }),
        'tests/test_a.py': scanned({ requests: ['service'] }),
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('does not reach the conftest.py of a sibling folder', () => {
    const report = analyze({
      others: [other('tests/api/conftest.py'), other('tests/unit/test_a.py')],
      imports: {
        'tests/api/conftest.py': [absolute('app.service', 'run')],
        'tests/unit/test_a.py': [],
      },
      literals: {
        'tests/api/conftest.py': scanned({ fixtures: [fixture('boot', [], true)] }),
      },
    });

    expect(categories(report)).toEqual({ 'tests/unit/test_a.py': 'no-production-runtime' });
  });

  it('loads no conftest.py when the project does not run pytest', () => {
    const report = unit(
      { 'tests/conftest.py': scanned({ fixtures: [fixture('boot', [], true)] }) },
      { runner: 'unittest' },
    );

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });
});

describe('modules named in pytest_plugins', () => {
  const others = [
    other('tests/test_a.py'),
    other('tests/conftest.py'),
    other('tests/plugin.py', 'other'),
  ];
  const imports = {
    'tests/test_a.py': [],
    'tests/conftest.py': [],
    'tests/plugin.py': [absolute('app.client', 'Client')],
  };
  const declared = scanned({ plugins: ['tests.plugin'] });

  it('reaches the module when the test uses a fixture it defines', () => {
    const report = analyze({
      others,
      imports,
      literals: {
        'tests/conftest.py': declared,
        'tests/plugin.py': scanned({ fixtures: [fixture('client')] }),
        'tests/test_a.py': scanned({ requests: ['client'] }),
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'transitive-production-runtime' });
  });

  it('does not reach the module when the test uses none of its fixtures', () => {
    const report = analyze({
      others,
      imports,
      literals: {
        'tests/conftest.py': declared,
        'tests/plugin.py': scanned({ fixtures: [fixture('client')] }),
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });

  it('reaches a production module that defines the fixture', () => {
    const report = analyze({
      modules: [SERVICE, productionAt('src/app/testing.py')],
      others: [other('tests/test_a.py'), other('tests/conftest.py')],
      imports: { 'tests/test_a.py': [], 'tests/conftest.py': [] },
      literals: {
        'tests/conftest.py': scanned({ plugins: ['src.app.testing'] }),
        'src/app/testing.py': scanned({ fixtures: [fixture('app_instance')] }),
        'tests/test_a.py': scanned({ requests: ['app_instance'] }),
      },
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'direct-production-runtime' });
  });
});
