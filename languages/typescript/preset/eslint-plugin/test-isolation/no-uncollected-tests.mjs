import { isTestFunctionChain } from '../test-quality/test-calls.mjs';
import {
  RUNNER_OPTION_SCHEMA,
  isCollectedByRunner,
  runnerOf,
  vocabularyOf,
} from '../rules/testing/runners/runner-option.mjs';

const TYPE_TEST_NAME = /\.(?:test|spec)-d\.[cm]?[jt]sx?$/u;

function isCollected(context) {
  return (
    isCollectedByRunner(context) ||
    (runnerOf(context) === 'vitest' && TYPE_TEST_NAME.test(context.filename))
  );
}

export const rule = {
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
            statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'CallExpression' &&
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
