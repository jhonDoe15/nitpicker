import { callbackOf, chainHasProperty, isCaseCall } from './test-calls.mjs';

const MIN_COPIES = 3;
const SKIPPED_KEYS = new Set([
  'parent',
  'loc',
  'range',
  'start',
  'end',
  'raw',
  'tokens',
  'comments',
]);
const LITERAL_TYPES = new Set(['Literal', 'TemplateElement']);

function shapeOf(node) {
  if (Array.isArray(node)) return node.map(shapeOf);
  if (node === null || typeof node !== 'object') return node;
  if (LITERAL_TYPES.has(node.type)) return node.type;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !SKIPPED_KEYS.has(key))
      .map(([key, value]) => [key, shapeOf(value)]),
  );
}

function isPlainCase(statement) {
  return (
    statement.type === 'ExpressionStatement' &&
    isCaseCall(statement.expression) &&
    !chainHasProperty(statement.expression.callee, 'each') &&
    callbackOf(statement.expression) !== undefined
  );
}

function copiesIn(statements) {
  const groups = new Map();
  for (const statement of statements.filter(isPlainCase)) {
    const callback = callbackOf(statement.expression);
    const key = JSON.stringify(shapeOf(callback));
    groups.set(key, [...(groups.get(key) ?? []), statement.expression]);
  }
  return [...groups.values()].filter((calls) => calls.length >= MIN_COPIES);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require one it.each table instead of copies of a test' },
    schema: [],
    messages: {
      copiedTest:
        'This test repeats the body of {{count}} others and differs only in its literals. Write one `it.each` table with a row per case. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    function check(node) {
      for (const calls of copiesIn(node.body)) {
        for (const call of calls.slice(MIN_COPIES - 1)) {
          context.report({
            node: call.callee,
            messageId: 'copiedTest',
            data: { count: String(calls.length - 1) },
          });
        }
      }
    }
    return { Program: check, BlockStatement: check };
  },
};
