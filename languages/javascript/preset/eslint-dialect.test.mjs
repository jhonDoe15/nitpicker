import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { strictPresetConfig } from '../../typescript/preset/eslint-config/strict.mjs';
import { defaultResolvedLayout } from '../../typescript/preset/layout.mjs';
import {
  JAVASCRIPT_ONLY_RULES,
  JSDOC_RULE_OPTIONS,
  applyJavascriptDialect,
  javascriptRuleEntries,
} from './eslint-dialect.mjs';

const javascript = { preset: 'javascript' };
const JAVASCRIPT_FILES = '**/*.{js,mjs,cjs}';
const TYPESCRIPT_FILES = '**/*.{ts,mts,cts}';

function ruleSettings(entries, rule) {
  return entries.flatMap((entry) =>
    entry.rules !== undefined && rule in entry.rules ? [entry.rules[rule]] : [],
  );
}

function entriesFor(entries, glob) {
  return entries.filter((entry) =>
    entry.files?.every((pattern) => [pattern].flat().includes(glob)),
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

  it('splits an entry the dialect changes: TypeScript files keep the TypeScript rules', () => {
    const entry = {
      files: ['src/**'],
      rules: {
        '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-require-imports': 'error',
        'no-undef': 'error',
      },
    };
    expect(applyJavascriptDialect([entry], javascript)).toEqual([
      { ...entry, files: [['src/**', TYPESCRIPT_FILES]] },
      { files: [['src/**', JAVASCRIPT_FILES]], rules: { 'no-undef': 'error' } },
    ]);
  });

  it('restricts an entry without files to the files of each dialect', () => {
    const [typescript, javascriptEntry] = applyJavascriptDialect(
      [{ rules: { '@typescript-eslint/no-require-imports': 'error' } }],
      javascript,
    );
    expect(typescript.files).toEqual([TYPESCRIPT_FILES]);
    expect(javascriptEntry).toEqual({ files: [JAVASCRIPT_FILES], rules: {} });
  });

  it('keeps entries the dialect does not change as they are', () => {
    const ignores = { ignores: ['dist/**'] };
    const unchanged = { files: ['src/**'], rules: { 'no-undef': 'error' } };
    const result = applyJavascriptDialect([ignores, unchanged], javascript);
    expect(result[0]).toBe(ignores);
    expect(result[1]).toBe(unchanged);
    expect(result).toHaveLength(2);
  });

  it('maps the comment, unknown, guard and module-load rules to JSDoc for JavaScript files only', () => {
    const moduleEffects = { rules: { 'nitpicker/report-module-load-effects': 'error' } };
    const mapped = applyJavascriptDialect([...strict, moduleEffects], javascript);
    for (const [rule, options] of Object.entries(JSDOC_RULE_OPTIONS)) {
      const forJavascript = ruleSettings(entriesFor(mapped, JAVASCRIPT_FILES), rule);
      const forTypescript = ruleSettings(entriesFor(mapped, TYPESCRIPT_FILES), rule);
      expect(forJavascript.length, rule).toBeGreaterThan(0);
      expect(forJavascript.length, rule).toBe(forTypescript.length);
      for (const setting of forJavascript) {
        expect(setting, rule).toEqual(['error', options]);
      }
      for (const setting of forTypescript) {
        expect(setting, rule).toBe('error');
      }
    }
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
    expect(applyJavascriptDialect(entries, javascript)).toEqual(entries);
  });

  it('maps a rule written as a numeric severity', () => {
    const [, mapped] = applyJavascriptDialect(
      [{ rules: { 'nitpicker/no-comments': 2, 'nitpicker/no-unknown-in-domain': 'warn' } }],
      javascript,
    );
    expect(mapped.rules).toEqual({
      'nitpicker/no-comments': [2, { jsdocTypes: true }],
      'nitpicker/no-unknown-in-domain': ['warn', { jsdoc: true }],
    });
  });

  it('removes the syntax selectors that only match TypeScript nodes from JavaScript files', () => {
    const mapped = applyJavascriptDialect(strict, javascript);
    const before = ruleSettings(strict, 'no-restricted-syntax');
    const forJavascript = ruleSettings(
      entriesFor(mapped, JAVASCRIPT_FILES),
      'no-restricted-syntax',
    );
    const forTypescript = ruleSettings(
      entriesFor(mapped, TYPESCRIPT_FILES),
      'no-restricted-syntax',
    );
    expect(forTypescript).toEqual(before);
    expect(forJavascript).toHaveLength(before.length);
    for (const setting of forJavascript) {
      expect(selectors(setting).some((text) => /\bTS[A-Z]/.test(text))).toBe(false);
      expect(selectors(setting).length).toBeGreaterThan(5);
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
    const [, forJavascript] = applyJavascriptDialect(entries, javascript);
    expect(forJavascript.rules['no-restricted-syntax']).toEqual([
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

describe('the dialect applied to files', () => {
  const restrictedSyntax = strictPresetConfig(defaultResolvedLayout, {}).filter(
    (entry) => entry.rules?.['no-restricted-syntax'] !== undefined,
  );
  const linter = new Linter({ configType: 'flat' });
  const config = applyJavascriptDialect(restrictedSyntax, javascript);

  function messages(filename, code) {
    return linter
      .verify(code, config, { filename })
      .filter(({ ruleId }) => ruleId === 'no-restricted-syntax')
      .map(({ message }) => message);
  }

  const domain = 'src/main/features/orders/domain';

  it('allows a CommonJS export from domain code', () => {
    expect(
      messages(`${domain}/total.cjs`, 'function total() {}\nmodule.exports = { total };'),
    ).toEqual([]);
    expect(messages(`${domain}/total.js`, 'function total() {}\nexports.total = total;')).toEqual(
      [],
    );
    expect(
      messages(`${domain}/total.js`, 'function total() {}\nmodule.exports.total = total;'),
    ).toEqual([]);
  });

  it('still rejects any other property assignment in domain code', () => {
    expect(messages(`${domain}/total.js`, 'function bump(order) { order.count = 1; }')).toEqual([
      expect.stringContaining('domain/ code does not assign to properties'),
    ]);
  });

  it('keeps the TypeScript rules for .ts files of a JavaScript project', () => {
    const typescript = messages(`${domain}/mode.ts`, 'export enum Mode { On }');
    const plainJavascript = messages(`${domain}/mode.js`, 'export const mode = 1;');
    expect(typescript.length).toBeGreaterThan(0);
    expect(plainJavascript).toEqual([]);
  });
});

describe('javascriptRuleEntries', () => {
  it('turns on the rules typescript-eslint enables for TypeScript files only', () => {
    expect(javascriptRuleEntries(javascript, ['src/**/*.js'])).toEqual([
      { files: ['src/**/*.js'], rules: JAVASCRIPT_ONLY_RULES },
    ]);
  });

  it('adds nothing for other presets', () => {
    expect(javascriptRuleEntries({}, ['src/**/*.js'])).toEqual([]);
    expect(javascriptRuleEntries(undefined, ['src/**/*.js'])).toEqual([]);
  });
});
