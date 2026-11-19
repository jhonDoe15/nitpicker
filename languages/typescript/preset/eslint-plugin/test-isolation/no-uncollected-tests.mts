import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { isTestFunctionChain } from '../test-quality/test-calls.mts';
import {
  RUNNER_OPTION_SCHEMA,
  isCollectedByRunner,
  runnerOf,
  vocabularyOf,
} from '../rules/runner-apis/runner-option.mts';

const TYPE_TEST_NAME = /\.(?:test|spec)-d\.[cm]?[jt]sx?$/u;

function isCollected(context: Parameters<typeof isCollectedByRunner>[0]): boolean {
  return (
    isCollectedByRunner(context) ||
    (runnerOf(context) === 'vitest' && TYPE_TEST_NAME.test(context.filename))
  );
}

export const rule: TSESLint.RuleModule<'neverRuns'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Report test calls in a file the test runner never collects' },
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      neverRuns:
        'This file defines tests but the test runner does not collect it, so they never run. {{collectIt}} An exception fits only when another test file runs it on purpose.',
    },
  },
  create(context) {
    if (isCollected(context)) {
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
          context.report({
            node: first,
            messageId: 'neverRuns',
            data: { collectIt: vocabularyOf(context).collectIt },
          });
        }
      },
    };
  },
};
