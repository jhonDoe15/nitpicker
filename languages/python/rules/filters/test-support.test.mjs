import { describe, expect, it } from 'vitest';
import { isSecurityFinding, isTestSupportPath, SECURITY_RULES } from './test-support.mjs';

describe('test support paths', () => {
  it.each([
    'tests/helpers/server.py',
    'src/shop/test_support/tls.py',
    'src/shop/testing/fakes.py',
    'test-support/server.py',
    'fixtures/payloads.py',
    'src/shop/__fixtures__/rows.py',
    'mocks/api.py',
    'src/shop/__mocks__/api.py',
    'src/shop/test_utils/db.py',
    'conftest.py',
    'src/shop/conftest.py',
    'src/shop/testing.py',
  ])('count %s as test support', (file) => {
    expect(isTestSupportPath(file)).toBe(true);
  });

  it.each(['src/shop/orders.py', 'src/testing_tools.py', 'src/shop/latest/mock.py', 'mocks.py'])(
    'count %s as production code',
    (file) => {
      expect(isTestSupportPath(file)).toBe(false);
    },
  );
});

describe('security findings', () => {
  it.each(['S501', 'S113', 'S324'])('count ruff %s', (rule) => {
    expect(isSecurityFinding({ tool: 'ruff', rule })).toBe(true);
  });

  it.each(SECURITY_RULES)('count the rules check %s', (rule) => {
    expect(isSecurityFinding({ tool: 'python-rules', rule })).toBe(true);
  });

  it.each([
    ['ruff', 'SIM102'],
    ['ruff', 'ARG001'],
    ['python-rules', 'frozen-dataclass'],
    ['mypy', 'S501'],
  ])('leave out %s %s', (tool, rule) => {
    expect(isSecurityFinding({ tool, rule })).toBe(false);
  });
});
