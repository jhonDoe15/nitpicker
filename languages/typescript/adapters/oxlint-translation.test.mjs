import { describe, expect, it } from 'vitest';
import {
  escapeGlob,
  messageIdResolver,
  nativeRuleIndex,
  PARITY_BRIDGED_RULES,
  rejectedRuleIds,
  reportedRuleKey,
  translatePlan,
  translateRule,
} from './oxlint-translation.mjs';

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

  it('loads a rule from its ESLint plugin when asked to, even if oxlint has a port', () => {
    const bridgedRules = new Set(['vitest/expect-expect']);
    expect(translateRule('vitest/expect-expect', { nativeRules, bridgedRules }).name).toBe(
      'js-vitest/expect-expect',
    );
  });
});

describe('translatePlan', () => {
  const plan = {
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
  };

  it('writes one override per group with oxlint names, severities and globals', () => {
    const translated = translatePlan(plan, { nativeRules, bridgedRules: PARITY_BRIDGED_RULES });

    expect(translated.overrides).toEqual([
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
    ]);
    expect(translated.plugins).toEqual([
      { namespace: 'nitpicker', alias: 'js-nitpicker', ruleNames: ['no-comments'] },
    ]);
    expect(translated.typeAware).toBe(false);
  });

  it('leaves type-aware plugin rules oxlint cannot run to ESLint', () => {
    const translated = translatePlan(plan, { nativeRules, bridgedRules: new Set() });

    expect(translated.residual).toEqual([
      { files: ['src/a.ts'], rules: ['functional/prefer-immutable-types'] },
    ]);
  });

  it('maps reported oxlint names back to the ESLint rule ids', () => {
    const { ruleNames } = translatePlan(plan, { nativeRules, bridgedRules: new Set() });

    expect(ruleNames.get(reportedRuleKey('eslint(no-debugger)'))).toBe('no-debugger');
    expect(ruleNames.get(reportedRuleKey('js-nitpicker(no-comments)'))).toBe(
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
