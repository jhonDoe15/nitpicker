import { describe, expect, it } from 'vitest';
import { describeRuleFinding } from '../../typed/rule-hint-views.mts';

describe('mined rule messages', () => {
  it.each([
    [
      'prefix-without-boundary',
      'suffix|host.endswith(domain)',
      '`host.endswith(domain)` checks a host suffix without a dot boundary, so `evilexample.com` matches `example.com`',
    ],
  ])('%s describes %s', (rule, subject, expected) => {
    expect(describeRuleFinding(rule, subject)).toBe(expected);
  });
});
