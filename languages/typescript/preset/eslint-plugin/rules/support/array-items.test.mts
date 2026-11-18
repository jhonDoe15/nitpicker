import type { TSESLint } from '@typescript-eslint/utils';
import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { hasNeverFalsyItems } from './array-items.mts';

const rule: TSESLint.RuleModule<'answer'> = {
  meta: { type: 'problem', schema: [], messages: { answer: '{{answer}}' } },
  create(context) {
    return {
      'CallExpression[callee.name="probe"] > :first-child'(
        node: Parameters<typeof hasNeverFalsyItems>[1],
      ) {
        context.report({
          node,
          messageId: 'answer',
          data: { answer: hasNeverFalsyItems(context, node) },
        });
      },
    };
  },
};

const { tester, cleanup, typed } = typedCases('nitpicker-array-items-', {
  noUncheckedIndexedAccess: true,
});
afterAll(cleanup);

const PROBE = 'export {}; declare function probe(value: unknown): void;';

function answers(declaration: string, answer: string) {
  return typed(`${PROBE} ${declaration} probe(xs);`, [{ messageId: 'answer', data: { answer } }]);
}

tester.run('hasNeverFalsyItems', rule, {
  valid: [],
  invalid: [
    answers('declare const xs: { id: string }[];', 'yes'),
    answers('declare const xs: readonly { id: string }[];', 'yes'),
    answers('declare const xs: [{ a: 1 }, { b: 2 }];', 'yes'),
    answers('declare const xs: (() => void)[];', 'yes'),
    answers('class A { x = 1; } declare const xs: A[];', 'yes'),
    answers('declare const xs: { id: string }[] | undefined;', 'yes'),
    answers('declare const xs: ({ id: string } | undefined)[];', 'no'),
    answers('declare const xs: ({ id: string } | null)[];', 'no'),
    answers('declare const xs: string[];', 'no'),
    answers('declare const xs: number[];', 'no'),
    answers('declare const xs: boolean[];', 'no'),
    answers('declare const xs: {}[];', 'no'),
    answers('declare const xs: Object[];', 'no'),
    answers('declare const xs: { toString(): string }[];', 'no'),
    answers('declare const xs: unknown[];', 'no'),
    answers('declare const xs: any[];', 'no'),
    answers('declare const xs: any;', 'no'),
    answers('declare const xs: Set<{ id: string }>;', 'no'),
    answers(
      'export function f<T>(xs: T[]) { return xs; } declare const xs: ReturnType<typeof f>;',
      'no',
    ),
    answers(
      'export function f<T extends { id: string }>(xs: T[]) { return xs; } declare const xs: ReturnType<typeof f>;',
      'yes',
    ),
    answers('declare const xs: object[];', 'yes'),
    answers('declare const xs: [{ a: 1 }, 0];', 'no'),
    answers('declare const xs: { id: string }[] | string[];', 'no'),
  ].map((entry) => ({ ...entry, code: entry.code })),
});

typescriptRuleTester().run('hasNeverFalsyItems without types', rule, {
  valid: [],
  invalid: [
    {
      code: `${PROBE} const xs = [{ a: 1 }]; probe(xs);`,
      errors: [{ messageId: 'answer', data: { answer: 'unknown' } }],
    },
  ],
});
