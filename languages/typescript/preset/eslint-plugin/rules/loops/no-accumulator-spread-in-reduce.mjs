import { hasBoundedKeys } from '../support/checked-types.mjs';
import { contains } from './loop-shapes.mjs';

const REDUCERS = new Set(['reduce', 'reduceRight']);

function reducerOf(call) {
  const [callback] = call.arguments;
  const isReduce =
    call.callee.type === 'MemberExpression' && REDUCERS.has(call.callee.property.name);
  const isFunction = ['ArrowFunctionExpression', 'FunctionExpression'].includes(callback?.type);
  return isReduce && isFunction && callback.params[0]?.type === 'Identifier' ? callback : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not spread the accumulator inside reduce',
      requiresTypeChecking: true,
      typeCheckingOnlyExempts: true,
    },
    schema: [],
    messages: {
      spread: [
        'Spreading the accumulator copies it on every step, so the work grows with the square of the list.',
        'Build the result in one pass: `Object.fromEntries(items.map(...))`, `Object.groupBy`,',
        '`Map.groupBy` or `flatMap`.',
        'If the list is always tiny, add an exception for nitpicker/no-accumulator-spread-in-reduce',
        'in nitpicker.config.json.',
      ].join(' '),
    },
  },
  create(context) {
    const reducers = [];
    return {
      CallExpression(node) {
        const reducer = reducerOf(node);
        if (reducer !== undefined) reducers.push(reducer);
      },
      SpreadElement(node) {
        const reducer = reducers.findLast((candidate) => contains(candidate, node));
        const accumulator = reducer?.params[0].name;
        if (node.argument.type !== 'Identifier' || node.argument.name !== accumulator) return;
        const isFixedRecord =
          node.parent.type === 'ObjectExpression' && hasBoundedKeys(context, node.argument);
        if (!isFixedRecord) context.report({ node, messageId: 'spread' });
      },
    };
  },
};
