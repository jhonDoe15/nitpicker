import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { firstOf } from '../eslint/test-support/finding-comparison.mts';
import { eslintShapedResults, UnmappedDiagnosticError } from './oxlint-diagnostics.mts';
import type { OxlintPlan } from './plan/oxlint-shapes.mts';
import {
  escapeGlob,
  messageIdResolver,
  nativeRuleIndex,
  PARITY_BRIDGED_RULES,
  rejectedRuleIds,
  reportedRuleKey,
  translatePlan,
  translateRule,
} from './oxlint-translation.mts';

const nativeRules = nativeRuleIndex([
  { scope: 'eslint', value: 'no-debugger', type_aware: false },
  { scope: 'eslint', value: 'no-unused-vars', type_aware: false },
  { scope: 'typescript', value: 'no-floating-promises', type_aware: true },
  { scope: 'vitest', value: 'expect-expect', type_aware: false },
]);

describe('translateRule', () => {
  it('runs core, typescript-eslint and vitest rules on their oxlint ports', () => {
    expect(translateRule('no-debugger', { nativeRules })).toEqual({
      name: 'eslint/no-debugger',
      typeAware: false,
    });
    expect(translateRule('@typescript-eslint/no-floating-promises', { nativeRules })).toEqual({
      name: 'typescript/no-floating-promises',
      typeAware: true,
    });
    expect(translateRule('@typescript-eslint/no-unused-vars', { nativeRules }).name).toBe(
      'eslint/no-unused-vars',
    );
    expect(translateRule('vitest/expect-expect', { nativeRules }).name).toBe(
      'vitest/expect-expect',
    );
  });

  it('loads rules oxlint lacks from their ESLint plugin under a prefixed name', () => {
    expect(translateRule('nitpicker/no-comments', { nativeRules })).toEqual({
      name: 'js-nitpicker/no-comments',
      plugin: { namespace: 'nitpicker', alias: 'js-nitpicker' },
      typeAware: false,
    });
    expect(translateRule('no-restricted-syntax', { nativeRules }).plugin).toEqual({
      namespace: '',
      alias: 'js-eslint-core',
    });
    expect(translateRule('@typescript-eslint/naming-convention', { nativeRules }).plugin).toEqual({
      namespace: '@typescript-eslint',
      alias: 'js-typescript-eslint',
    });
  });

  it.each([
    ['jest/expect-expect', 'js-jest', 'jest'],
    ['node-test/no-focused-tests', 'js-node-test', 'node-test'],
    ['mocha/no-identical-title', 'js-mocha', 'mocha'],
  ])('bridges %s as the ESLint rule, never as an oxlint port', (ruleId, alias, namespace) => {
    const withPorts = nativeRuleIndex([
      { scope: 'jest', value: 'expect-expect', type_aware: false },
      { scope: 'jest', value: 'no-focused-tests', type_aware: false },
      { scope: 'mocha', value: 'no-identical-title', type_aware: false },
    ]);

    const translated = translateRule(ruleId, { nativeRules: withPorts });

    expect(translated.name).toBe(`${alias}/${ruleId.slice(ruleId.indexOf('/') + 1)}`);
    expect(translated.plugin).toEqual({ namespace, alias });
  });

  it('loads a rule from its ESLint plugin when asked to, even if oxlint has a port', () => {
    const bridgedRules = new Set(['vitest/expect-expect']);
    expect(translateRule('vitest/expect-expect', { nativeRules, bridgedRules }).name).toBe(
      'js-vitest/expect-expect',
    );
  });
});

describe('translatePlan', () => {
  const plan: OxlintPlan = {
    groups: [
      {
        files: ['src/a.ts'],
        globals: { process: 'readonly' },
        rules: {
          'no-debugger': [2],
          'no-unused-vars': [2, { args: 'after-used' }],
          'functional/prefer-immutable-types': [2],
          'nitpicker/no-comments': [1],
        },
      },
    ],
    typedPluginRules: ['functional/prefer-immutable-types'],
    noInlineConfig: [],
    ruleMessages: {},
    nativeRules: [],
  };

  it('writes one override per group with oxlint names, severities and globals', () => {
    const translated = translatePlan(plan, { nativeRules, bridgedRules: PARITY_BRIDGED_RULES });

    expect(translated.partitions.map(({ overrides }) => overrides)).toEqual([
      [
        {
          files: ['src/a.ts'],
          globals: { process: 'readonly' },
          rules: {
            'eslint/no-debugger': 'error',
            'eslint/no-unused-vars': [
              'error',
              {
                argsIgnorePattern: '[^\\s\\S]',
                varsIgnorePattern: '[^\\s\\S]',
                caughtErrorsIgnorePattern: '[^\\s\\S]',
                destructuredArrayIgnorePattern: '[^\\s\\S]',
                args: 'after-used',
              },
            ],
            'js-nitpicker/no-comments': 'warn',
          },
        },
      ],
    ]);
    expect(translated.plugins).toEqual([
      { namespace: 'nitpicker', alias: 'js-nitpicker', ruleNames: ['no-comments'] },
    ]);
    expect([...translated.typeAwareRules]).toEqual([]);
  });

  it('splits groups with different settings into separate configs', () => {
    const settings = { 'testing-library/utils-module': 'test-utils' };
    const translated = translatePlan(
      {
        groups: [
          { files: ['a.ts'], rules: { 'no-debugger': [2] }, settings: {} },
          { files: ['b.ts'], rules: { 'no-debugger': [2] }, settings },
          { files: ['c.ts'], rules: { 'no-console': [2] }, settings: {} },
        ],
        typedPluginRules: [],
        noInlineConfig: [],
        ruleMessages: {},
        nativeRules: [],
      },
      { nativeRules, bridgedRules: new Set() },
    );

    expect(translated.partitions.map((partition) => [partition.settings, partition.files])).toEqual(
      [
        [{}, ['a.ts', 'c.ts']],
        [settings, ['b.ts']],
      ],
    );
  });

  it('leaves type-aware plugin rules oxlint cannot run to ESLint', () => {
    const translated = translatePlan(plan, { nativeRules, bridgedRules: new Set() });

    expect(translated.residual).toEqual([
      { files: ['src/a.ts'], rules: ['functional/prefer-immutable-types'] },
    ]);
  });

  it('maps reported oxlint names back to the ESLint rule ids', () => {
    const { ruleNames } = translatePlan(plan, { nativeRules, bridgedRules: new Set() });

    expect(ruleNames.get(reportedRuleKey('eslint(no-debugger)') ?? '')).toBe('no-debugger');
    expect(ruleNames.get(reportedRuleKey('js-nitpicker(no-comments)') ?? '')).toBe(
      'nitpicker/no-comments',
    );
    expect(reportedRuleKey(undefined)).toBeUndefined();
  });
});

describe('rejectedRuleIds', () => {
  it('names the ESLint rules whose options oxlint refused', () => {
    const ruleNames = new Map([
      ['eslint/preserve-caught-error', 'preserve-caught-error'],
      ['eslint/no-debugger', 'no-debugger'],
    ]);

    expect(
      rejectedRuleIds(
        'x Invalid configuration for rule `preserve-caught-error`:\n  unknown field',
        ruleNames,
      ),
    ).toEqual(['preserve-caught-error']);
    expect(rejectedRuleIds('Failed to parse', ruleNames)).toEqual([]);
  });
});

describe('escapeGlob', () => {
  it('matches a file name with glob characters literally', () => {
    expect(escapeGlob('src/[id]/page{1}.ts')).toBe('src/\\[id\\]/page\\{1\\}.ts');
  });
});

describe('messageIdResolver', () => {
  const messageIdOf = messageIdResolver({
    'no-restricted-syntax': { restrictedSyntax: '{{message}}' },
    'nitpicker/size': {
      tooLong: "Function '{{name}}' has {{count}} lines.",
      tooLongAnonymous: 'Function has {{count}} lines.',
    },
  });

  it('recovers the ESLint message id from the reported text', () => {
    expect(messageIdOf('no-restricted-syntax', 'Use a for...of loop.')).toBe('restrictedSyntax');
    expect(messageIdOf('nitpicker/size', "Function 'a.b' has 40 lines.")).toBe('tooLong');
    expect(messageIdOf('nitpicker/size', 'Function has 40 lines.')).toBe('tooLongAnonymous');
  });

  it('leaves the id out when no template of the rule matches', () => {
    expect(messageIdOf('nitpicker/size', 'Something else.')).toBeUndefined();
    expect(messageIdOf('eslint/no-debugger', 'Unexpected debugger statement.')).toBeUndefined();
  });
});

describe('eslintShapedResults', () => {
  const stage = mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-diagnostics-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-outside-'));
  const outsideTarget = path.join(outside, 'target.ts');
  const outsideLink = path.join(stage, 'linked-outside.ts');
  writeFileSync(path.join(stage, 'a.ts'), 'export const roll = Math.random();\n');
  writeFileSync(outsideTarget, 'debugger;\n');
  symlinkSync(outsideTarget, outsideLink);

  afterAll(() => {
    rmSync(stage, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  function shaped(diagnostic: { code: string; message: string; help?: string }) {
    const naming = {
      ruleNames: new Map([
        ['eslint/no-restricted-properties', 'no-restricted-properties'],
        ['eslint/no-restricted-globals', 'no-restricted-globals'],
      ]),
      messageIdOf: () => undefined,
      ruleMessages: {},
      neutralized: new Map(),
    };
    const labels = [{ span: { offset: 20, length: 11 } }];
    const results = eslintShapedResults(
      stage,
      [{ filename: 'a.ts', labels, ...diagnostic }],
      naming,
    );
    return firstOf(firstOf(results).messages).message;
  }

  it('keeps the configured message that oxlint moves into the help of a restricted property', () => {
    expect(
      shaped({
        code: 'eslint(no-restricted-properties)',
        message: "'Math.random' is restricted from being used.",
        help: 'Use crypto.randomUUID().',
      }),
    ).toBe("'Math.random' is restricted from being used. Use crypto.randomUUID().");
  });

  it('drops diagnostics for files outside the stage while preserving in-stage findings', () => {
    const naming = {
      ruleNames: new Map([['eslint/no-debugger', 'no-debugger']]),
      messageIdOf: () => undefined,
      ruleMessages: {},
      neutralized: new Map(),
    };
    const results = eslintShapedResults(
      stage,
      [
        { filename: '../outside.ts', code: 'eslint(no-debugger)', message: 'outside parent' },
        { filename: '/other/root/file.ts', code: 'eslint(no-debugger)', message: 'outside root' },
        {
          filename: realpathSync(outsideLink),
          code: 'eslint(no-debugger)',
          message: 'outside symlink target',
        },
        { filename: '', code: 'eslint(no-debugger)', message: 'empty path' },
        { filename: '.', code: 'eslint(no-debugger)', message: 'stage directory' },
        {
          filename: 'a.ts',
          code: 'eslint(no-debugger)',
          message: '`debugger` statement is not allowed',
          labels: [{ span: { offset: 0, length: 6 } }],
        },
      ],
      naming,
    );

    expect(results).toEqual([
      {
        filePath: 'a.ts',
        messages: [
          {
            ruleId: 'no-debugger',
            messageId: undefined,
            message: '`debugger` statement is not allowed',
            severity: 2,
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 7,
          },
        ],
      },
    ]);
  });

  it('returns an empty list when every reported file is outside the stage', () => {
    const naming = {
      ruleNames: new Map<string, string>(),
      messageIdOf: () => undefined,
      ruleMessages: {},
      neutralized: new Map(),
    };
    const diagnostic = { filename: '../a.ts', code: 'eslint(no-debugger)', message: 'x' };
    expect(eslintShapedResults(stage, [diagnostic], naming)).toEqual([]);
  });

  it('leaves the generic help of other rules out', () => {
    expect(
      shaped({
        code: 'eslint(no-restricted-globals)',
        message: "Unexpected use of 'name'. Write window.name.",
        help: 'Use a local variable or function parameter instead of the restricted global.',
      }),
    ).toBe("Unexpected use of 'name'. Write window.name.");
  });

  it.each([
    [
      'TS(1245)',
      "Method 'm' cannot have an implementation because it is marked abstract.",
      undefined,
    ],
    ['TS(1028)', 'Accessibility modifier already seen.', 'Remove the duplicate modifier.'],
    ['TS(1016)', 'A required parameter cannot follow an optional parameter.', undefined],
  ])('treats %s as a fatal parse failure alongside normal rule findings', (code, message, help) => {
    writeFileSync(path.join(stage, 'valid.ts'), 'debugger;\n');
    const naming = {
      ruleNames: new Map([['eslint/no-debugger', 'no-debugger']]),
      messageIdOf: () => undefined,
      ruleMessages: {},
      neutralized: new Map(),
    };
    const results = eslintShapedResults(
      stage,
      [
        {
          filename: 'a.ts',
          code,
          message,
          ...(help === undefined ? {} : { help }),
          labels: [{ span: { offset: 0, length: 6 } }],
        },
        {
          filename: 'valid.ts',
          code: 'eslint(no-debugger)',
          message: '`debugger` statement is not allowed',
          labels: [{ span: { offset: 0, length: 9 } }],
        },
      ],
      naming,
    );

    expect(results).toEqual([
      {
        filePath: 'a.ts',
        messages: [
          { fatal: true, message, severity: 2, line: 1, column: 1, endLine: 1, endColumn: 7 },
        ],
      },
      {
        filePath: 'valid.ts',
        messages: [
          {
            ruleId: 'no-debugger',
            messageId: undefined,
            message: '`debugger` statement is not allowed',
            severity: 2,
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 10,
          },
        ],
      },
    ]);
  });

  it.each(['eslint(unknown-rule)', 'oxc(unexpected)', 'TS(not-a-number)'])(
    'still throws UnmappedDiagnosticError for non-TS-code diagnostic %s',
    (code) => {
      const naming = {
        ruleNames: new Map<string, string>(),
        messageIdOf: () => undefined,
        ruleMessages: {},
        neutralized: new Map(),
      };
      expect(() =>
        eslintShapedResults(stage, [{ filename: 'a.ts', code, message: 'boom' }], naming),
      ).toThrow(UnmappedDiagnosticError);
    },
  );
});
