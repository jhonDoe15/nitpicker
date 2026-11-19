import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { replacing } from '../support/ranges.mts';
import { freeName } from './names.mts';
import { allOf } from './plans.mts';

const rule: TSESLint.RuleModule<'use'> = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { use: 'use' } },
  create(context) {
    const { sourceCode } = context;
    return {
      'CallExpression[callee.name="use"]'(call: TSESTree.CallExpression) {
        const name = freeName(sourceCode, { sites: [call], within: call, base: 'byId' });
        const fix = name === undefined ? undefined : allOf([replacing(call.range, `In(${name})`)]);
        context.report({ node: call, messageId: 'use', ...(fix === undefined ? {} : { fix }) });
      },
    };
  },
};

const ERR = [{ messageId: 'use' as const }];

function fixes(code: string, output: string) {
  return { code, output, errors: ERR };
}

typescriptRuleTester().run('fix edit helpers', rule, {
  valid: [],
  invalid: [
    fixes('export const a = use();', 'export const a = In(byId);'),
    fixes(
      'const byId = 1;\nexport const a = use(byId);',
      'const byId = 1;\nexport const a = In(byId2);',
    ),
    fixes(
      'export function f() { const byId2 = 2; return () => { const byId = 1; return [byId, byId2, use()]; }; }',
      'export function f() { const byId2 = 2; return () => { const byId = 1; return [byId, byId2, In(byId3)]; }; }',
    ),
    fixes(
      'export const a = () => { use(); const byId = 1; return byId; };',
      'export const a = () => { In(byId2); const byId = 1; return byId; };',
    ),
  ],
});
