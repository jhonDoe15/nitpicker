import { findVariable } from '../analysis/constant-resolution.mjs';
import { hasBoundedKeys } from '../support/checked-types.mjs';
import { contains, enclosingLoop } from './loop-shapes.mjs';

const REDUCERS = new Set(['reduce', 'reduceRight']);
const IDENTIFIER = 'Identifier';
const ONE_PASS =
  '`Object.fromEntries(items.map(...))`, `Object.groupBy`, `Map.groupBy` or `flatMap`';
const SQUARED = 'so the work grows with the square of the list.';
const EXCEPTION = 'An exception fits only when the list is always tiny.';

function reducerOf(call) {
  const [callback] = call.arguments;
  const isReduce =
    call.callee.type === 'MemberExpression' && REDUCERS.has(call.callee.property.name);
  const isFunction = ['ArrowFunctionExpression', 'FunctionExpression'].includes(callback?.type);
  return isReduce && isFunction && callback.params[0]?.type === IDENTIFIER ? callback : undefined;
}

function isAccumulator(node, name) {
  return node?.type === IDENTIFIER && node.name === name;
}

function spreadsAccumulator(items, name) {
  return items.some((item) => item?.type === 'SpreadElement' && isAccumulator(item.argument, name));
}

function copiedShape(value, name) {
  if (value.type === 'ArrayExpression' && spreadsAccumulator(value.elements, name)) {
    return 'array';
  }
  if (value.type === 'ObjectExpression' && spreadsAccumulator(value.properties, name)) {
    return 'object';
  }
  const concatenates =
    value.type === 'CallExpression' &&
    value.callee.type === 'MemberExpression' &&
    isAccumulator(value.callee.object, name) &&
    value.callee.property.name === 'concat';
  return concatenates ? 'array' : undefined;
}

function isDeclaredOutside(context, target, found) {
  const scope = found.loop ?? found.callback;
  const declaration = findVariable(context, target, target.name)?.defs[0]?.name;
  return declaration !== undefined && !contains(scope, declaration);
}

function isLoopCopy(context, node) {
  const { left, right, operator } = node;
  const shape =
    operator === '=' && left.type === IDENTIFIER ? copiedShape(right, left.name) : undefined;
  const found = shape === undefined ? undefined : enclosingLoop(node, context.sourceCode);
  if (found === undefined || !isDeclaredOutside(context, left, found)) {
    return false;
  }
  return shape === 'array' || !hasBoundedKeys(context, left);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not copy an accumulator on every step of reduce or a loop',
      requiresTypeChecking: true,
      typeCheckingOnlyExempts: true,
    },
    schema: [],
    messages: {
      spread: [
        `Spreading the accumulator copies it on every step, ${SQUARED}`,
        `Build the result in one pass: ${ONE_PASS}.`,
        EXCEPTION,
      ].join(' '),
      loopCopy: [
        `This loop copies \`{{name}}\` into a new value on every pass, ${SQUARED}`,
        `Build the result in one pass (${ONE_PASS}),`,
        'or push into an array (or `set` into a `Map`) created before the loop.',
        EXCEPTION,
      ].join(' '),
    },
  },
  create(context) {
    const reducers = [];
    return {
      CallExpression(node) {
        const reducer = reducerOf(node);
        if (reducer !== undefined) {
          reducers.push(reducer);
        }
      },
      AssignmentExpression(node) {
        if (isLoopCopy(context, node)) {
          context.report({ node, messageId: 'loopCopy', data: { name: node.left.name } });
        }
      },
      SpreadElement(node) {
        const reducer = reducers.findLast((candidate) => contains(candidate, node));
        const accumulator = reducer?.params[0].name;
        if (node.argument.type !== IDENTIFIER || node.argument.name !== accumulator) {
          return;
        }
        const isFixedRecord =
          node.parent.type === 'ObjectExpression' && hasBoundedKeys(context, node.argument);
        if (!isFixedRecord) {
          context.report({ node, messageId: 'spread' });
        }
      },
    };
  },
};
