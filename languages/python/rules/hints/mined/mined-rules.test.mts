import { describe, expect, it } from 'vitest';
import { describeRuleFinding } from '../../typed/rule-hint-views.mts';

describe('mined rule messages', () => {
  it.each([
    [
      'prefix-without-boundary',
      'suffix|host.endswith(domain)',
      '`host.endswith(domain)` checks a host suffix without a dot boundary, so `evilexample.com` matches `example.com`',
    ],
    [
      'unanchored-affix-replace',
      "suffix|part.replace('.git', '')",
      "`part.replace('.git', '')` removes a suffix with a plain " +
        'replace, which rewrites the first occurrence anywhere ' +
        '(`blog.github.io` loses its `.git`)',
    ],
    [
      'case-mismatched-lookup',
      'raw|lower|found|item',
      '`found` is filled with the lower-cased `item` but looked up ' +
        'with `item` as written, so a value with other capitals misses',
    ],
    [
      'precondition-message-names-other-value',
      'value|name',
      'The check is on `value` but its message names `name`, so a ' +
        'failure points at the wrong value, or the value the message ' +
        'names goes through unchecked',
    ],
  ])('%s describes %s', (rule, subject, expected) => {
    expect(describeRuleFinding(rule, subject)).toBe(expected);
  });
});
