import { describe, expect, it } from 'vitest';
import {
  analyze,
  categories,
  fixture,
  other,
  OPTIONS,
  scanned,
} from '../test-support/runtime-data.mjs';

describe('the pytest-django bridge', () => {
  const django = { ...OPTIONS, django: true };
  const bridged = (found, options = django) => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/conftest.py')],
      imports: { 'tests/test_a.py': [], 'tests/conftest.py': [] },
      literals: {
        'tests/conftest.py': scanned({
          fixtures: [fixture('api', ['admin_client']), fixture('boot', ['db'], true)],
        }),
        'tests/test_a.py': scanned(found),
      },
      options,
    });
    return report.tests[0];
  };

  it.each([
    'client',
    'admin_client',
    'async_client',
    'rf',
    'async_rf',
    'db',
    'transactional_db',
    'django_db_setup',
    'live_server',
    'admin_user',
    'django_user_model',
    'django_username_field',
    'settings',
    'django_assert_num_queries',
    'django_assert_max_num_queries',
    'mailoutbox',
  ])('counts a test that requests the %s fixture', (name) => {
    const test = bridged({ requests: [name] });

    expect(test.category).toBe('framework-production-runtime');
    expect(test.subprocessBridges).toEqual(['pytest-django']);
  });

  it('counts the django_db mark, on a function, a class or the module', () => {
    expect(bridged({ marks: ['django_db'] }).category).toBe('framework-production-runtime');
  });

  it('counts a pytest-django fixture a conftest.py fixture asks for', () => {
    expect(bridged({ requests: ['api'] }).category).toBe('framework-production-runtime');
  });

  it('counts an autouse fixture that asks for a pytest-django fixture', () => {
    expect(bridged({}).category).toBe('framework-production-runtime');
  });

  it('gives no bridge to a test that asks for no such fixture, or outside a Django project', () => {
    const noFixture = analyze({
      others: [other('tests/test_a.py')],
      imports: { 'tests/test_a.py': [] },
      literals: { 'tests/test_a.py': scanned({ requests: ['tmp_path'] }) },
      options: django,
    });
    const elsewhere = bridged({ requests: ['client'], marks: ['django_db'] }, OPTIONS);

    expect(categories(noFixture)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
    expect(elsewhere.category).toBe('no-production-runtime');
  });

  it('gives no bridge when the project defines the fixture itself without asking for the original', () => {
    const report = analyze({
      others: [other('tests/test_a.py'), other('tests/conftest.py')],
      imports: { 'tests/test_a.py': [], 'tests/conftest.py': [] },
      literals: {
        'tests/conftest.py': scanned({ fixtures: [fixture('client')] }),
        'tests/test_a.py': scanned({ requests: ['client'] }),
      },
      options: django,
    });

    expect(categories(report)).toEqual({ 'tests/test_a.py': 'no-production-runtime' });
  });
});
