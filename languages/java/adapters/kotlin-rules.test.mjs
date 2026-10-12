import { describe, expect, it } from 'vitest';
import {
  addOneWayHint,
  isBannedSuppression,
  ONE_WAY_RULE_IDS,
  ONE_WAY_RULES,
  SUPPRESSION_RULE,
} from './kotlin-rules.mjs';
import { expectedMessage, kotlinRuleCases } from './fixtures/kotlin-rules/cases.mjs';

const detektFinding = (rule, message) => ({
  tool: 'detekt',
  rule,
  path: 'src/main/kotlin/demo/A.kt',
  identity: 'id',
  message,
  classification: 'enforceable',
});

describe('one-way rule messages', () => {
  const detektCases = kotlinRuleCases.filter(({ rule }) => rule !== SUPPRESSION_RULE);

  it.each(detektCases.map((testCase) => [testCase.id, testCase]))(
    '%s names the allowed form and the exception route',
    (_id, testCase) => {
      const { message } = addOneWayHint(
        detektFinding(testCase.rule, expectedMessage(testCase, 'banned')),
      );

      expect(message.toLowerCase()).toContain(testCase.allowedForm.toLowerCase());
      expect(message).toContain(
        `"exceptions" entry for rule ${testCase.rule} in nitpicker.config.json`,
      );
      expect(message.startsWith(expectedMessage(testCase, 'banned').replace(/\.$/, ''))).toBe(true);
    },
  );

  it('has a banned and an allowed fixture for every rule and for the inline suppression', () => {
    expect([...new Set(kotlinRuleCases.map(({ rule }) => rule))].toSorted()).toEqual(
      [...ONE_WAY_RULE_IDS, SUPPRESSION_RULE].toSorted(),
    );
    for (const testCase of kotlinRuleCases) {
      expect(testCase.banned).not.toBe(testCase.allowed);
      expect(testCase.banned).not.toBe('');
      expect(testCase.allowed).not.toBe('');
    }
    expect(new Set(kotlinRuleCases.map(({ id }) => id)).size).toBe(kotlinRuleCases.length);
  });

  it('keeps a message that ends without a period readable', () => {
    const { message } = addOneWayHint(
      detektFinding('detekt.style.UnnecessaryLet', 'let expression can be omitted'),
    );

    expect(message).toBe(
      'let expression can be omitted. Call the member directly; `let` is for `value?.let { ... }`. To allow it on specific paths, add an "exceptions" entry for rule detekt.style.UnnecessaryLet in nitpicker.config.json.',
    );
  });

  it('gives a rule whose detekt message names the allowed form only the exception route', () => {
    const { message } = addOneWayHint(
      detektFinding(
        'detekt.style.UseDataClass',
        'The class A defines no functionality and only holds data. Consider converting it to a data class.',
      ),
    );

    expect(message).toBe(
      'The class A defines no functionality and only holds data. Consider converting it to a data class. To allow it on specific paths, add an "exceptions" entry for rule detekt.style.UseDataClass in nitpicker.config.json.',
    );
  });

  it('leaves other detekt rules and other tools alone', () => {
    const other = detektFinding('detekt.style.MagicNumber', 'magic');
    const sameRuleOtherTool = { ...detektFinding(ONE_WAY_RULES[0].id, 'x'), tool: 'ktlint' };

    expect(addOneWayHint(other)).toBe(other);
    expect(addOneWayHint(sameRuleOtherTool)).toBe(sameRuleOtherTool);
  });

  it('lists each rule once under the id detekt reports', () => {
    expect(new Set(ONE_WAY_RULE_IDS).size).toBe(ONE_WAY_RULE_IDS.length);
    for (const id of ONE_WAY_RULE_IDS) {
      expect(id).toMatch(/^detekt\.(?:potential-bugs|coroutines|style)\.[A-Z]\w+$/);
    }
  });
});

describe('isBannedSuppression', () => {
  it.each([
    'UnsafeCallOnNullableType',
    'detekt.UnsafeCallOnNullableType',
    'detekt:UnsafeCallOnNullableType',
    'detekt.potential-bugs.UnsafeCallOnNullableType',
    'detekt:potential-bugs:UnsafeCallOnNullableType',
    'ForbiddenMethodCall',
    'UseDataClass',
    'style',
    'detekt.style',
    'detekt:coroutines',
    'potential-bugs',
    'all',
    'ALL',
    'All',
    'detekt.all',
    'detekt:ALL',
  ])('bans %s', (token) => {
    expect(isBannedSuppression(token)).toBe(true);
  });

  it.each([
    'MagicNumber',
    'detekt.style.MagicNumber',
    'unchecked_cast',
    'UNCHECKED_CAST',
    'unsafecallonnullabletype',
    'naming',
    'detekt',
    'allowed',
    '',
  ])('allows %s', (token) => {
    expect(isBannedSuppression(token)).toBe(false);
  });
});
