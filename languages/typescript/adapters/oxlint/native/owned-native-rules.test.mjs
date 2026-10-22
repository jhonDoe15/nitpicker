import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { accumulatingSpreadMessages } from '../../../preset/eslint-plugin/rules/collections/no-accumulating-spread.mjs';
import { nativeRuleIndex, translatePlan, translateRule } from '../oxlint-translation.mjs';
import { createProject, lintProject } from '../test-support/oxlint-project.mjs';
import {
  directReducerCheck,
  OWNED_NATIVE_PLUGINS,
  OWNED_NATIVE_RULES,
  ownedNativeMessage,
  ownedNativeName,
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
const DIAGNOSTICS = [
  [REDUCE, "It looks like you're spreading an `Object`. Consider using …", 'reduceObject', true],
  [REDUCE, "It looks like you're spreading an `Array`. Consider using …", 'reduceArray', true],
  [REDUCE, 'Consider using `Object.assign()` or `Array.prototype.push()` …', 'reduce', true],
  [
    LOOP,
    'Consider using `Object.assign()` to mutate the accumulator instead.',
    'loopObject',
    false,
  ],
  [LOOP, 'Consider using `Array.prototype.push()` to mutate …', 'loopArray', false],
];

describe('the owned native rule allowlist', () => {
  it('pairs each owned rule with one native oxlint rule and enables only its plugin', () => {
    expect([...OWNED_NATIVE_RULES.keys()]).toEqual([RULE]);
    expect(ownedNativeName(RULE)).toBe(NATIVE);
    expect(ownedNativeName('nitpicker/no-comments')).toBeUndefined();
    expect(OWNED_NATIVE_PLUGINS).toEqual(['oxc']);
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
  it.each(DIAGNOSTICS)('maps "%s" with help "%s" to %s', (message, help, messageId, reduce) => {
    const diagnostic = { code: 'oxc(no-accumulating-spread)', message, help };
    expect(ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages })).toEqual({
      messageId,
      message: accumulatingSpreadMessages[messageId],
      needsDirectReducer: reduce,
    });
  });

  it('reads a diagnostic without help as the general reduce message', () => {
    const diagnostic = { code: 'oxc(no-accumulating-spread)', message: REDUCE };
    expect(ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages }).messageId).toBe('reduce');
  });

  it('leaves other rules alone and fails loudly when the owned rule lacks the message', () => {
    const diagnostic = { code: 'oxc(no-accumulating-spread)', message: LOOP, help: 'push' };
    expect(ownedNativeMessage({ ruleId: 'no-debugger', diagnostic, ruleMessages })).toBeUndefined();
    expect(() => ownedNativeMessage({ ruleId: RULE, diagnostic, ruleMessages: {} })).toThrow(
      "nitpicker/no-accumulating-spread has no message loopArray for oxlint's oxc(no-accumulating-spread)",
    );
  });
});

describe('directReducerCheck', () => {
  const cases = [
    ['xs.reduce((acc, x) => [...acc, x], []);', 24, true],
    ['xs.reduce(((acc, x) => [...acc, x]), []);', 25, true],
    ["xs?.['reduceRight'](function (acc, x) { return { ...acc, x }; });", 50, true],
    ['xs.reduce((acc, x) => [...acc, x], [], extra);', 24, false],
    ['xs.map((acc, i) => [...acc]).reduce((a, b) => a, []);', 21, false],
    ['xs.reduce((a, b) => a, ys.map((acc, i) => [...acc]));', 44, false],
    ['xs.reduce((a, b) => { const f = (acc, y) => [...acc, y]; return f(a, b); }, []);', 46, false],
    ['xs.reduce(step(), [...seed]);', 24, false],
    ['xs.#reduce((acc, x) => [...acc, x], []);', 25, false],
  ];

  it.each(cases)(
    'in %s the spread at column %i is in a reduce callback: %s',
    (code, column, direct) => {
      expect(directReducerCheck('src/a.ts', code)({ line: 1, column })).toBe(direct);
    },
  );

  it('parses JSX files as JSX', () => {
    const code = 'export const a = xs.reduce((acc, x) => [...acc, <b key={x} />], []);';
    expect(directReducerCheck('src/a.tsx', code)({ line: 1, column: 41 })).toBe(true);
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
  it('honours a disable directive that names the owned rule', () => {
    const root = createProject('nitpicker-owned-native-', {
      'policy.mjs': POLICY,
      'src/a.ts': [
        '// eslint-disable-next-line nitpicker/no-accumulating-spread',
        'export const a = (xs) => xs.reduce((acc, x) => [...acc, x], []);',
        'export const b = (xs) => xs.reduce((acc, x) => [...acc, x], []);',
      ].join('\n'),
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
    ]);
  });
});
