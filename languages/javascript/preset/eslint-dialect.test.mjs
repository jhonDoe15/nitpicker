import { describe, expect, it } from 'vitest';
import { strictPresetConfig } from '../../typescript/preset/eslint-config/strict.mjs';
import { defaultResolvedLayout } from '../../typescript/preset/layout.mjs';
import { DROPPED_RULES, JSDOC_RULE_OPTIONS, applyJavascriptDialect } from './eslint-dialect.mjs';

const javascript = { preset: 'javascript' };

function ruleSettings(entries, rule) {
  return entries.flatMap((entry) =>
    entry.rules !== undefined && rule in entry.rules ? [entry.rules[rule]] : [],
  );
}

function selectors(setting) {
  return setting.slice(1).map((restriction) => restriction.selector ?? restriction);
}

describe('applyJavascriptDialect', () => {
  const strict = strictPresetConfig(defaultResolvedLayout, {});

  it('returns the entries untouched for the TypeScript preset', () => {
    expect(applyJavascriptDialect(strict, {})).toBe(strict);
    expect(applyJavascriptDialect(strict, { preset: 'java' })).toBe(strict);
    expect(applyJavascriptDialect(strict, undefined)).toBe(strict);
  });

  it('drops the rules that police TypeScript-only syntax', () => {
    const entries = [
      {
        files: ['src/**'],
        rules: {
          '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
          '@typescript-eslint/consistent-type-imports': 'error',
          'no-undef': 'error',
        },
      },
    ];
    expect(applyJavascriptDialect(entries, javascript)).toEqual([
      { files: ['src/**'], rules: { 'no-undef': 'error' } },
    ]);
    expect(DROPPED_RULES).toEqual([
      '@typescript-eslint/consistent-type-definitions',
      '@typescript-eslint/consistent-type-imports',
    ]);
  });

  it('keeps entries without rules as they are', () => {
    const entry = { ignores: ['dist/**'] };
    expect(applyJavascriptDialect([entry], javascript)[0]).toBe(entry);
  });

  it('maps the comment, unknown, guard and module-load rules to JSDoc', () => {
    const moduleEffects = { rules: { 'nitpicker/report-module-load-effects': 'error' } };
    const mapped = applyJavascriptDialect([...strict, moduleEffects], javascript);
    for (const [rule, options] of Object.entries(JSDOC_RULE_OPTIONS)) {
      const settings = ruleSettings(mapped, rule);
      expect(settings.length, rule).toBeGreaterThan(0);
      for (const setting of settings) {
        expect(setting, rule).toEqual(['error', options]);
      }
    }
  });

  it('leaves the TypeScript severities and options alone for rules without a mapping', () => {
    const entries = [
      { rules: { 'nitpicker/no-throw': 'error', 'no-undef': ['error', { typeof: true }] } },
    ];
    expect(applyJavascriptDialect(entries, javascript)).toEqual(entries);
  });

  it('does not turn a disabled mapped rule on', () => {
    const entries = [
      {
        rules: {
          'nitpicker/no-comments': 'off',
          'nitpicker/no-unknown-in-domain': 0,
          'nitpicker/no-handwritten-boundary-guard': ['off'],
        },
      },
    ];
    expect(applyJavascriptDialect(entries, javascript)).toEqual([
      {
        rules: {
          'nitpicker/no-comments': 'off',
          'nitpicker/no-unknown-in-domain': 0,
          'nitpicker/no-handwritten-boundary-guard': ['off'],
        },
      },
    ]);
  });

  it('maps a rule written as a numeric severity', () => {
    const mapped = applyJavascriptDialect(
      [{ rules: { 'nitpicker/no-comments': 2, 'nitpicker/no-unknown-in-domain': 'warn' } }],
      javascript,
    );
    expect(mapped[0].rules).toEqual({
      'nitpicker/no-comments': [2, { jsdocTypes: true }],
      'nitpicker/no-unknown-in-domain': ['warn', { jsdoc: true }],
    });
  });

  it('removes the syntax selectors that only match TypeScript nodes', () => {
    const before = ruleSettings(strict, 'no-restricted-syntax');
    const after = ruleSettings(applyJavascriptDialect(strict, javascript), 'no-restricted-syntax');
    expect(after).toHaveLength(before.length);
    for (const [index, setting] of after.entries()) {
      const kept = selectors(setting).join('\n');
      expect(kept).not.toMatch(/\bTS[A-Z]/);
      expect(kept).toContain("Literal[raw='null']");
      expect(kept).toContain('ConditionalExpression > ConditionalExpression');
      expect(selectors(before[index]).join('\n')).toMatch(/TSAsExpression/);
    }
  });

  it('keeps severity and string selectors when filtering restrictions', () => {
    const entries = [
      {
        rules: {
          'no-restricted-syntax': [
            'warn',
            'TSAnyKeyword',
            'ForStatement',
            { selector: 'TSEnumDeclaration', message: 'enum' },
            { selector: 'WhileStatement', message: 'while' },
          ],
        },
      },
    ];
    expect(applyJavascriptDialect(entries, javascript)[0].rules['no-restricted-syntax']).toEqual([
      'warn',
      'ForStatement',
      { selector: 'WhileStatement', message: 'while' },
    ]);
  });

  it('does not filter a no-restricted-syntax rule that is not an array', () => {
    const entries = [{ rules: { 'no-restricted-syntax': 'off' } }];
    expect(applyJavascriptDialect(entries, javascript)).toEqual(entries);
  });
});
