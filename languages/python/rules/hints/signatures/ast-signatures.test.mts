import { describe, expect, it } from 'vitest';
import { RULES_TOOL } from '../../rule-hints.mts';
import { describeRuleFinding, withHint } from '../../typed/rule-hint-views.mts';

describe('signature rule messages', () => {
  it.each([
    [
      'tri-state-boolean',
      'send(urgent)',
      '`send(urgent)` is a boolean that can also be `None`, a third state',
    ],
    [
      'falsy-default',
      'page(limit)',
      '`page(limit)` replaces a falsy argument with a default, so `0`, `""`, `[]` and `False` count as not given',
    ],
    [
      'null-branch-fall-through',
      'value|value.name',
      'The null branch handles `value` and then falls through to `value.name`, which uses `value`',
    ],
    [
      'parameter-mutation',
      'names.append (collect)',
      '`names.append` changes the argument the caller passed to `collect`',
    ],
    ['parameter-mutation', 'odd', '`odd` changes the argument the caller passed in'],
    [
      'compatibility-shim',
      '__getattr__',
      'A module `__getattr__` keeps names that were removed or renamed working',
    ],
    [
      'compatibility-shim',
      'warnings.warn(DeprecationWarning)',
      'A deprecation warning keeps an old call working next to its replacement',
    ],
    [
      'compatibility-shim',
      '@deprecated old_total',
      '`old_total` is kept as a deprecated name next to its replacement',
    ],
    [
      'compatibility-shim',
      'OldOrder = Order',
      '`OldOrder` is an alias that keeps the old name of `Order` working',
    ],
    ['compatibility-shim', 'odd', '`odd` keeps an old name working'],
  ])('describe %s for %s', (rule, subject, description) => {
    expect(describeRuleFinding(rule, subject)).toBe(description);
  });

  it.each([
    ['tri-state-boolean', 'an enum'],
    ['falsy-default', 'is not None'],
    ['parameter-mutation', 'Build and return a new value'],
    ['compatibility-shim', 'delete the old name'],
  ])('name the allowed form of %s and end with the exception route', (rule, form) => {
    const { message } = withHint({
      tool: RULES_TOOL,
      rule,
      path: 'src/mod.py',
      message: 'Subject.',
      classification: 'enforceable',
    });

    expect(message).toContain(form);
    expect(message).toMatch(
      /^.*If this is intended, add \{"rule":"[a-z-]+","paths":\["src\/mod\.py"\],"reason":"\.\.\."\} to "python\.exceptions" in nitpicker\.config\.json\.$/u,
    );
  });
});
