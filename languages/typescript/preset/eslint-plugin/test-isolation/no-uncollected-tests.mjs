import { readLayout } from '../../head-policy.mjs';
import { isTestFunctionChain } from '../test-quality/test-calls.mjs';

const layout = readLayout();
const RUNNABLE_NAME = new RegExp(
  `\\.(?:test|spec)(?:-d)?\\.(?:${layout.extensions.join('|')})$`,
  'u',
);

export const rule = {
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
            statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'CallExpression' &&
            isTestFunctionChain(statement.expression.callee),
        );
        if (first !== undefined) {
          context.report({ node: first, messageId: 'neverRuns' });
        }
      },
    };
  },
};
