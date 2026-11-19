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
      'number-truthiness',
      'run(state)',
      '`run(state)` is a number, zero duration or queryset tested for truth, so `0` or an empty value reads as false or missing',
    ],
    [
      'null-branch-fall-through',
      'value|value.name',
      'The null branch handles `value` and then falls through to `value.name`, which uses `value`',
    ],
    [
      'uninjectable-delay',
      'time.sleep|RETRY_DELAY|2000|poll',
      '`time.sleep` waits RETRY_DELAY (2000 ms), a module constant that public `poll` cannot override, so a test must wait it out or fake the clock',
    ],
    [
      'parameter-mutation',
      'names.append (collect)',
      '`names.append` changes the argument the caller passed to `collect`',
    ],
    ['parameter-mutation', 'odd', '`odd` changes the argument the caller passed in'],
    [
      'shared-state-mutation',
      'DEFAULTS in UserConfig',
      '`DEFAULTS` is a module-level collection that `UserConfig` keeps by reference and then changes, so the shared default changes for every other user',
    ],
    [
      'shared-state-mutation',
      'get_items()',
      '`get_items()` returns the same cached list, dict or set to every caller, and a caller changes it, so later calls get the changed value',
    ],
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
    [
      'swapped-arguments',
      'docs|proc|pipe|docs',
      '`docs` is passed as `proc` and `pipe` as `docs`; did you swap them?',
    ],
  ])('describe %s for %s', (rule, subject, description) => {
    expect(describeRuleFinding(rule, subject)).toBe(description);
  });

  it.each([
    ['tri-state-boolean', 'an enum'],
    ['falsy-default', 'is not None'],
    ['number-truthiness', 'qs.exists()'],
    ['presence-truthiness', 'table.get(key)'],
    ['parameter-mutation', 'Build and return a new value'],
    ['shared-state-mutation', 'copy.deepcopy(DEFAULTS)'],
    ['compatibility-shim', 'delete the old name'],
    ['swapped-arguments', 'order of the parameters'],
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
