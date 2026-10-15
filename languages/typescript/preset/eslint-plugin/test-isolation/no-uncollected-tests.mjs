import { readLayout } from '../../head-policy.mjs';

const layout = readLayout();
const RUNNABLE_NAME = new RegExp(`\\.(?:test|spec)\\.(?:${layout.extensions.join('|')})$`, 'u');
const TEST_CALLS = new Set(['describe', 'suite', 'it', 'test']);

function rootName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') return rootName(callee.object);
  return callee.type === 'CallExpression' ? rootName(callee.callee) : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Report test calls in a file the test runner never collects' },
    schema: [],
    messages: {
      neverRuns:
        'This file defines tests but is not named like a test file, so they never run. Rename it `*.test.ts` (or `*.spec.ts`). If another test file runs it on purpose, add an exception for nitpicker/no-uncollected-tests in nitpicker.config.json.',
    },
  },
  create(context) {
    if (RUNNABLE_NAME.test(context.filename)) return {};
    return {
      Program(program) {
        const [first] = program.body.filter(
          (statement) =>
            statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'CallExpression' &&
            TEST_CALLS.has(rootName(statement.expression.callee)),
        );
        if (first !== undefined) context.report({ node: first, messageId: 'neverRuns' });
      },
    };
  },
};
