import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../rules/runner-apis/runner-option.mjs';
import { callbackOf, chainHasProperty, isCaseCall } from './test-calls.mjs';

const MIN_COPIES = 3;
const LITERAL_TOKENS = new Set([
  'String',
  'Numeric',
  'Boolean',
  'Null',
  'RegularExpression',
  'Template',
  'BigInt',
]);

function shapeOf(sourceCode, node) {
  return sourceCode
    .getTokens(node)
    .map((token) => (LITERAL_TOKENS.has(token.type) ? `<${token.type}>` : token.value))
    .join(' ');
}

function isPlainCase(statement) {
  return (
    statement.type === 'ExpressionStatement' &&
    isCaseCall(statement.expression) &&
    !chainHasProperty(statement.expression.callee, 'each') &&
    callbackOf(statement.expression) !== undefined
  );
}

function copiesIn(sourceCode, statements) {
  const groups = new Map();
  for (const statement of statements.filter(isPlainCase)) {
    const callback = callbackOf(statement.expression);
    const key = shapeOf(sourceCode, callback);
    groups.set(key, [...(groups.get(key) ?? []), statement.expression]);
  }
  return [...groups.values()].filter((calls) => calls.length >= MIN_COPIES);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require one table of cases instead of copies of a test' },
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      copiedTest:
        'This test repeats the body of {{count}} others and differs only in its literals. Put the cases in one table and {{eachCase}}.',
    },
  },
  create(context) {
    function check(node) {
      for (const calls of copiesIn(context.sourceCode, node.body)) {
        for (const call of calls.slice(MIN_COPIES - 1)) {
          context.report({
            node: call.callee,
            messageId: 'copiedTest',
            data: { count: String(calls.length - 1), eachCase: vocabularyOf(context).eachCase },
          });
        }
      }
    }
    return { Program: check, BlockStatement: check };
  },
};
