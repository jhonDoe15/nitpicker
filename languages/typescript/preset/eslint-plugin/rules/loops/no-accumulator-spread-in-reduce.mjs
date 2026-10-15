const REDUCERS = new Set(['reduce', 'reduceRight']);

function contains(outer, inner) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

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
    docs: { description: 'Do not spread the accumulator inside reduce' },
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
        if (node.argument.type === 'Identifier' && node.argument.name === accumulator) {
          context.report({ node, messageId: 'spread' });
        }
      },
    };
  },
};
