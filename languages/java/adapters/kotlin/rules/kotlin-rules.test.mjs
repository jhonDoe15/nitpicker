import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { withKotlinRuleMessage } from './kotlin-messages.mjs';
import {
  compilerWarningRule,
  isBannedSuppression,
  ONE_WAY_RULE_IDS,
  ONE_WAY_RULES,
  SUPPRESSION_RULE,
  withAllowedForm,
} from './kotlin-rules.mjs';
import { expectedMessage, kotlinRuleCases } from './test-support/kotlin-rule-cases.mjs';
import { fileURLToPath } from 'node:url';

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
      const { message } = withKotlinRuleMessage(
        detektFinding(testCase.rule, expectedMessage(testCase, 'banned')),
      );

      const wording = {
        id: testCase.id,
        namesAllowedForm: message.toLowerCase().includes(testCase.allowedForm.toLowerCase()),
        namesExceptionRoute: message.endsWith(
          exceptionHint(testCase.rule, 'src/main/kotlin/demo/A.kt'),
        ),
        keepsDetektText: message.startsWith(expectedMessage(testCase, 'banned').replace(/\.$/, '')),
      };

      expect(wording).toEqual({
        id: testCase.id,
        namesAllowedForm: true,
        namesExceptionRoute: true,
        keepsDetektText: true,
      });
    },
  );

  it('has a banned and an allowed fixture for every rule and for the inline suppression', () => {
    expect([...new Set(kotlinRuleCases.map(({ rule }) => rule))].toSorted()).toEqual(
      [...ONE_WAY_RULE_IDS, SUPPRESSION_RULE].toSorted(),
    );
    for (const testCase of kotlinRuleCases) {
      expect(testCase.banned).not.toBe(testCase.allowed);
    }
    expect(new Set(kotlinRuleCases.map(({ id }) => id)).size).toBe(kotlinRuleCases.length);
  });

  it('keeps a message that ends without a period readable', () => {
    const { message } = withAllowedForm(
      detektFinding('detekt.style.UnnecessaryLet', 'let expression can be omitted'),
    );

    expect(message).toBe(
      'let expression can be omitted. Call the member directly; `let` is for `value?.let { ... }`.',
    );
  });

  it('gives a rule whose detekt message names the allowed form no second one', () => {
    const finding = detektFinding(
      'detekt.style.UseDataClass',
      'The class A defines no functionality and only holds data. Consider converting it to a data class.',
    );

    expect(withAllowedForm(finding)).toBe(finding);
  });

  it('tells a test to use assertFailsWith for a broad catch', () => {
    const file = 'src/main/kotlin/demo/A.kt';
    const { message } = withKotlinRuleMessage(
      detektFinding(
        'detekt.exceptions.TooGenericExceptionCaught',
        'The caught exception is too generic. Prefer catching specific exceptions to the case that is currently handled.',
      ),
    );

    expect(message).toBe(
      `The caught exception is too generic. Prefer catching specific exceptions to the case that is currently handled. In a test, use \`assertFailsWith\`. ${exceptionHint('detekt.exceptions.TooGenericExceptionCaught', file)}`,
    );
  });

  it('leaves other detekt rules and other tools without an allowed form', () => {
    const other = detektFinding('detekt.style.MagicNumber', 'magic');
    const sameRuleOtherTool = { ...detektFinding(ONE_WAY_RULES[0].id, 'x'), tool: 'ktlint' };

    expect(withAllowedForm(other)).toBe(other);
    expect(withAllowedForm(sameRuleOtherTool)).toBe(sameRuleOtherTool);
  });

  it('lists each rule once under the id detekt reports', () => {
    expect(new Set(ONE_WAY_RULE_IDS).size).toBe(ONE_WAY_RULE_IDS.length);
    for (const id of ONE_WAY_RULE_IDS) {
      expect(id).toMatch(
        /^detekt\.(?:potential-bugs|exceptions|coroutines|style|complexity)\.[A-Z]\w+$/,
      );
    }
  });
});

describe('nitpicker-detekt.yml', () => {
  function parseRulesets(text) {
    const rulesets = {};
    let ruleset;
    let rule;
    for (const [, indent, key, value] of text
      .split('\n')
      .map((line) => /^( *)([\w-]+):(?: ([^\n]*))?$/.exec(line) ?? [])
      .filter((match) => match.length > 0)) {
      if (indent === '') {
        ruleset = { settings: {}, rules: {} };
        rulesets[key] = ruleset;
      } else if (indent.length === 2 && /^[A-Z]/.test(key)) {
        rule = {};
        ruleset.rules[key] = rule;
      } else {
        (indent.length === 2 ? ruleset.settings : rule)[key] = value;
      }
    }
    return rulesets;
  }

  const rulesets = parseRulesets(
    readFileSync(
      path.join(
        fileURLToPath(new URL('../../', import.meta.url)),
        '../detekt/nitpicker-detekt.yml',
      ),
      'utf8',
    ),
  );

  it('configures exactly the rules of ONE_WAY_RULES', () => {
    const ids = Object.entries(rulesets).flatMap(([ruleset, { rules }]) =>
      Object.keys(rules).map((name) => `detekt.${ruleset}.${name}`),
    );

    expect(ids.toSorted()).toEqual(ONE_WAY_RULE_IDS.toSorted());
  });

  it('pins every ruleset and rule against a project config that switches it off or narrows it', () => {
    const pinned = { active: 'true', excludes: '[]', ignoreAnnotated: '[]', includes: '[]' };
    for (const { settings, rules } of Object.values(rulesets)) {
      expect(settings).toEqual(pinned);
      for (const [name, rule] of Object.entries(rules)) {
        const { active, excludes, ignoreAnnotated, includes, severity } = rule;
        expect({ active, excludes, ignoreAnnotated, includes, severity }).toEqual({
          ...pinned,
          ignoreAnnotated: name === 'UnusedParameter' ? undefined : pinned.ignoreAnnotated,
          severity: 'warning',
        });
      }
    }
  });
});

describe('isBannedSuppression', () => {
  it.each([
    'UnsafeCallOnNullableType',
    'MagicNumber',
    'LongMethod',
    'detekt',
    'detekt.UnsafeCallOnNullableType',
    'detekt:UnsafeCallOnNullableType',
    'detekt.style.MagicNumber',
    'detekt:potential-bugs:UnsafeCallOnNullableType',
    'detekt.all',
    'detekt:ALL',
    'style',
    'naming',
    'potential-bugs',
    'all',
    'ALL',
    'All',
    'ktlint',
    'ktlint:standard:indent',
    'ktlint.standard.indent',
    'UNCHECKED_CAST',
    'DEPRECATION',
    'TYPEALIAS_EXPANSION_DEPRECATION',
    'unused',
    'UNUSED_PARAMETER',
    'UNUSED_VARIABLE',
  ])('bans %s', (token) => {
    expect(isBannedSuppression(token)).toBe(true);
  });

  it.each(['unchecked', 'unchecked_cast', 'rawtypes', 'allowed', 'detector', 'ktlinter', ''])(
    'allows the compiler diagnostic or unrelated token %s',
    (token) => {
      expect(isBannedSuppression(token)).toBe(false);
    },
  );
});

describe('compilerWarningRule', () => {
  it('names the kotlinc rule a compiler warning suppression hides', () => {
    expect(
      ['UNCHECKED_CAST', 'DEPRECATION', 'TYPEALIAS_EXPANSION_DEPRECATION', 'unused'].map(
        compilerWarningRule,
      ),
    ).toEqual(['kotlinc/unchecked', 'kotlinc/deprecation', 'kotlinc/deprecation', undefined]);
  });
});
