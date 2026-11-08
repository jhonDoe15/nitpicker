import { describe, expect, it } from 'vitest';
import { defaultResolvedLayout } from '../../preset/layout.mjs';
import { strictPresetConfig } from '../../preset/eslint-config/strict.mjs';
import { nitpickerRules } from '../../preset/eslint-plugin/index.mjs';
import { routedEslintFields } from './eslint-hints.mjs';
import { statedAllowedForm, withStatedForm } from './stated-form.mjs';

const PLUGIN_RULES = ['no-comments', 'no-magic-numbers', 'no-production-console'];
const UNREPORTED_MESSAGES = new Set(['no-magic-numbers useConst']);
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/gu;

function pluginMessages() {
  return PLUGIN_RULES.flatMap((name) =>
    Object.entries(nitpickerRules.rules[name].meta.messages)
      .filter(([id]) => !UNREPORTED_MESSAGES.has(`${name} ${id}`))
      .map(([id, text]) => [`nitpicker/${name}`, id, text.replaceAll(PLACEHOLDER, 'value')]),
  );
}

function restrictedSyntaxMessages() {
  const configs = [false, true].flatMap((react) =>
    strictPresetConfig(defaultResolvedLayout, {}, { react }),
  );
  const messages = configs.flatMap((config) => {
    const setting = config.rules?.['no-restricted-syntax'];
    return Array.isArray(setting) ? setting.slice(1).map((entry) => entry.message) : [];
  });
  return [...new Set(messages)].map((text) => ['no-restricted-syntax', 'restrictedSyntax', text]);
}

const IMPERATIVE_START = /^[A-Za-z]+\b/u;

describe('statedAllowedForm', () => {
  it.each([
    [
      'Do not nest ternaries. Use early returns, a lookup object keyed by the value, or one `const` per branch.',
      'Use early returns, a lookup object keyed by the value, or one `const` per branch.',
    ],
    [
      'domain/ code does not use reduce without an initial value: pass one, e.g. xs.reduce((sum, x) => sum + x, 0).',
      'pass one, e.g. xs.reduce((sum, x) => sum + x, 0).',
    ],
    [
      'Use `undefined` for an absent value; `null` is not allowed in a JSDoc type. Type it as optional.',
      'Use `undefined` for an absent value',
    ],
    [
      'Use the application logger instead of console.log(). An exception fits only when this module prints the program output.',
      'Use the application logger instead of console.log().',
    ],
    [
      'No magic number: 42. Name it with a module-level constant: `const A = 1; const B = 2;` (0 and 1 are allowed). An exception fits only when the number is clear where it is.',
      'Name it with a module-level constant: `const A = 1; const B = 2;` (0 and 1 are allowed).',
    ],
  ])('reads the allowed form of %j', (message, form) => {
    expect(statedAllowedForm(message)).toBe(form);
  });

  it('finds none in a message that only names the problem', () => {
    expect(statedAllowedForm('Classes are not allowed. An exception fits only when needed.')).toBe(
      undefined,
    );
  });
});

describe('withStatedForm', () => {
  it.each([...pluginMessages(), ...restrictedSyntaxMessages()])(
    'gives %s %s an allowed form that its message states: %s',
    (ruleId, _id, message) => {
      const { allowedForm } = withStatedForm(ruleId, { message });

      expect([
        message.includes(allowedForm),
        IMPERATIVE_START.test(allowedForm),
        allowedForm.length > 0,
      ]).toEqual([true, true, true]);
    },
  );

  it('keeps an allowed form a hint already gave', () => {
    expect(
      withStatedForm('no-restricted-syntax', { message: 'Use x. Use y.', allowedForm: 'Use y.' }),
    ).toEqual({ message: 'Use x. Use y.', allowedForm: 'Use y.' });
  });

  it('leaves the messages of other rules alone', () => {
    expect(withStatedForm('eqeqeq', { message: 'Use ===.' })).toEqual({ message: 'Use ===.' });
  });
});

describe('unused variables', () => {
  it.each(['@typescript-eslint/no-unused-vars', 'no-unused-vars'])(
    'tells %s findings to remove or use the binding',
    (ruleId) => {
      const fields = routedEslintFields({
        ruleId,
        text: "'total' is assigned a value but never used.",
        relativePath: 'src/main/a.ts',
      });

      expect([fields.message.split(' If this is intended')[0], fields.allowedForm]).toEqual([
        "'total' is assigned a value but never used. Remove it, or use it.",
        'Remove it, or use it.',
      ]);
    },
  );
});
