import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { accumulatingSpreadMessages } from '../../../preset/eslint-plugin/rules/collections/accumulating-spread-messages.mjs';
import { nativeRuleIndex, translatePlan, translateRule } from '../oxlint-translation.mjs';
import { createProject, lintProject } from '../test-support/oxlint-project.mjs';
import {
  ownedNativeChecker,
  ownedNativeMessage,
  ownedNativeName,
  ownedNativePlugins,
  ownedNativeRuleIds,
} from './owned-native-rules.mjs';

const RULE = 'nitpicker/no-accumulating-spread';
const NATIVE = 'oxc/no-accumulating-spread';
const listed = nativeRuleIndex([
  { scope: 'eslint', value: 'no-debugger', type_aware: false },
  { scope: 'oxc', value: 'no-accumulating-spread', type_aware: false },
  { scope: 'oxc', value: 'no-map-spread', type_aware: false },
]);
const ruleMessages = { [RULE]: accumulatingSpreadMessages };

const REDUCE = 'Do not spread accumulators in Array.prototype.reduce()';
const LOOP = 'Do not spread accumulators in loops';
const ARRAY_HELP = "It looks like you're spreading an `Array`. Consider using …";
const LABELS = [
  { label: 'From this spread', span: { offset: 23, length: 6 } },
  { label: 'For this reduce', span: { offset: 0, length: 9 } },
];
const ADAPTER = 'src/main/features/billing/adapters/ledger.ts';

describe('the owned native rule allowlist', () => {
  it('pairs each owned rule with one native oxlint rule and enables only its plugin', () => {
    expect(ownedNativeRuleIds()).toEqual([RULE]);
    expect(ownedNativeName(RULE)).toBe(NATIVE);
    expect(ownedNativeName('nitpicker/no-comments')).toBeUndefined();
    expect(ownedNativePlugins()).toEqual(['oxc']);
  });

  it('runs the owned rule natively when oxlint lists it, and bridges it otherwise', () => {
    expect(translateRule(RULE, { nativeRules: listed })).toEqual({
      name: NATIVE,
      typeAware: false,
    });
    expect(translateRule(RULE, { nativeRules: listed, bridgedRules: new Set([RULE]) }).name).toBe(
      'js-nitpicker/no-accumulating-spread',
    );
    expect(translateRule(RULE, { nativeRules: nativeRuleIndex([]) }).name).toBe(
      'js-nitpicker/no-accumulating-spread',
    );
  });

  it('never selects a native oxc rule that no enabled ESLint rule maps to', () => {
    const plan = {
      groups: [{ files: ['src/a.ts'], rules: { 'no-debugger': [2], 'nitpicker/no-null': [2] } }],
      typedPluginRules: [],
    };
    const translated = translatePlan(plan, { nativeRules: listed, bridgedRules: new Set() });
    expect(Object.keys(translated.partitions[0].overrides[0].rules)).toEqual([
      'eslint/no-debugger',
      'js-nitpicker/no-null',
    ]);
    const withRule = translatePlan(
      { ...plan, groups: [{ ...plan.groups[0], rules: { [RULE]: [2] } }] },
      { nativeRules: listed, bridgedRules: new Set() },
    );
    expect(withRule.partitions[0].overrides[0].rules).toEqual({ [NATIVE]: 'error' });
    expect(withRule.ruleNames).toEqual(new Map([[NATIVE, RULE]]));
  });
});

describe('ownedNativeMessage', () => {
  it('maps the native report to the owned message and the check that confirms it', () => {
    const diagnostic = {
      code: 'oxc(no-accumulating-spread)',
      message: REDUCE,
      help: ARRAY_HELP,
      labels: LABELS,
    };
    expect(
      ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages, filePath: ADAPTER }),
    ).toEqual({
      messageId: 'reduceArray',
      message: accumulatingSpreadMessages.reduceArray,
      check: { ruleId: RULE, reducer: true, spreadOffset: 23 },
    });
    const domain = 'src/main/features/billing/domain/totals.ts';
    expect(
      ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages, filePath: domain }).messageId,
    ).toBe('domainReduceArray');
  });

  it('leaves a bridged report of the owned rule to its own message', () => {
    const diagnostic = {
      code: 'js-nitpicker(no-accumulating-spread)',
      message: accumulatingSpreadMessages.loopArray,
      labels: LABELS,
    };
    expect(
      ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages, filePath: ADAPTER }),
    ).toBeUndefined();
  });

  it('leaves other rules alone and fails loudly when the owned rule lacks the message', () => {
    const diagnostic = {
      code: 'oxc(no-accumulating-spread)',
      message: LOOP,
      help: 'push',
      labels: LABELS,
    };
    const call = { diagnostic, filePath: ADAPTER };
    expect(ownedNativeMessage({ ...call, ruleId: 'no-debugger', ruleMessages })).toBeUndefined();
    expect(() => ownedNativeMessage({ ...call, ruleId: RULE, ruleMessages: {} })).toThrow(
      "nitpicker/no-accumulating-spread has no message loopArray for oxlint's oxc(no-accumulating-spread)",
    );
  });

  it('confirms each check with the checker of its owned rule', () => {
    const keeps = ownedNativeChecker(ADAPTER, 'xs.reduce((acc, x) => [...acc, x].slice(-3), []);');
    expect(keeps({ ruleId: RULE, reducer: true, spread: { line: 1, column: 24 } })).toBe(false);
  });
});

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(import.meta.resolve('../../../preset/eslint-plugin/index.mjs'))};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: nitpickerRules },
    rules: { '${RULE}': 'error' },
  },
];
`;

const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('the owned native rule inside a project', () => {
  it('honours a disable directive that names the owned rule and reads past a byte order mark', () => {
    const root = createProject('nitpicker-owned-native-', {
      'policy.mjs': POLICY,
      'src/a.ts': [
        '// eslint-disable-next-line nitpicker/no-accumulating-spread',
        'export const a = (xs) => xs.reduce((acc, x) => [...acc, x], []);',
        'export const b = (xs) => xs.reduce((acc, x) => [...acc, x], []);',
      ].join('\n'),
      'src/b.ts': '\uFEFFexport const c = (xs) => xs.reduce((acc, x) => [...acc, x], []);',
    });
    roots.push(root);
    const messages = lintProject({ root, patterns: ['src/**/*.ts'] }).flatMap((result) =>
      result.messages.map(({ ruleId, messageId, line, column }) => ({
        file: path.relative(root, result.filePath),
        ruleId,
        messageId,
        line,
        column,
      })),
    );
    expect(messages).toEqual([
      { file: 'src/a.ts', ruleId: RULE, messageId: 'reduceArray', line: 3, column: 49 },
      { file: 'src/b.ts', ruleId: RULE, messageId: 'reduceArray', line: 1, column: 49 },
    ]);
  });
});
