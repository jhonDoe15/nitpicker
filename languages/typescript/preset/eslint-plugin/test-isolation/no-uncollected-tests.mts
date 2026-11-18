import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { readLayout } from '../rules/typed/policy-views.mts';
import { isTestFunctionChain } from '../test-quality/test-calls.mts';

const layout = readLayout();
const RUNNABLE_NAME = new RegExp(
  `\\.(?:test|spec)(?:-d)?\\.(?:${layout.extensions.join('|')})$`,
  'u',
);

export const rule: TSESLint.RuleModule<'neverRuns'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Report test calls in a file the test runner never collects' },
    schema: [],
    messages: {
      neverRuns:
        'This file defines tests but is not named like a test file, so they never run. Rename it `*.test.ts` (or `*.spec.ts`). An exception fits only when another test file runs it on purpose.',
    },
  },
  create(context) {
    if (RUNNABLE_NAME.test(context.filename)) {
      return {};
    }
    return {
      Program(program) {
        const [first] = program.body.filter(
          (statement) =>
            statement.type === AST_NODE_TYPES.ExpressionStatement &&
            statement.expression.type === AST_NODE_TYPES.CallExpression &&
            isTestFunctionChain(statement.expression.callee),
        );
        if (first !== undefined) {
          context.report({ node: first, messageId: 'neverRuns' });
        }
      },
    };
  },
};
