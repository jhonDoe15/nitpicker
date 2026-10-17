import { describe, expect, it } from 'vitest';
import { isSecurityFinding, isSupportSecurityFinding, SECURITY_RULES } from './test-support.mjs';

describe('support files the rules script reported', () => {
  const support = new Set(['qa/servers/fake_tls.py']);

  it('count a security finding in a listed support file', () => {
    const found = { tool: 'ruff', rule: 'S501', path: 'qa/servers/fake_tls.py' };

    expect(isSupportSecurityFinding(found, support)).toBe(true);
  });

  it.each([
    { tool: 'ruff', rule: 'S501', path: 'shop/testing/ab_variants.py' },
    { tool: 'ruff', rule: 'F401', path: 'qa/servers/fake_tls.py' },
    { tool: 'ruff', rule: 'S501' },
  ])('leave out $rule in $path', (found) => {
    expect(isSupportSecurityFinding(found, support)).toBe(false);
  });

  it('count nothing when no support files are listed', () => {
    expect(isSupportSecurityFinding({ tool: 'ruff', rule: 'S501', path: 'mocks/a.py' })).toBe(
      false,
    );
  });
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
