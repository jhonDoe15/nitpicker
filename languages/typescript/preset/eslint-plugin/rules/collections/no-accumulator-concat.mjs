import { contains } from '../analysis/ancestry.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { enclosingLoop } from '../loops/loop-shapes.mjs';
import { hasArrayType } from '../support/checked-types.mjs';

const REDUCERS = new Set(['reduce', 'reduceRight']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';

function reducerOf(call) {
  const [callback] = call.arguments;
  const isReduce = call.callee.type === MEMBER && REDUCERS.has(call.callee.property.name);
  const isFunction = FUNCTIONS.has(callback?.type);
  return isReduce && isFunction && callback.params[0]?.type === IDENTIFIER ? callback : undefined;
}

function isConcatOf(value, name) {
  const callee = value.type === 'CallExpression' ? value.callee : undefined;
  return (
    callee?.type === MEMBER &&
    callee.object.type === IDENTIFIER &&
    callee.object.name === name &&
    callee.property.name === 'concat'
  );
}

function isArrayValue(context, node, start) {
  return hasArrayType(context, node) ?? start?.type === 'ArrayExpression';
}

function outsideDefinition(context, target, found) {
  const scope = found.loop ?? found.callback;
  const definition = findVariable(context, target, target.name)?.defs[0];
  return definition !== undefined && !contains(scope, definition.name) ? definition : undefined;
}

function isLoopCopy(context, node) {
  const { left, right, operator } = node;
  if (operator !== '=' || left.type !== IDENTIFIER || !isConcatOf(right, left.name)) {
    return false;
  }
  const found = enclosingLoop(node, context);
  const definition = found && outsideDefinition(context, left, found);
  return definition !== undefined && isArrayValue(context, left, definition.node.init);
}

function isReduceConcat(context, node, reducers) {
  const object = node.callee.type === MEMBER ? node.callee.object : undefined;
  const reducer =
    object?.type === IDENTIFIER
      ? reducers.findLast((candidate) => contains(candidate, node))
      : undefined;
  const accumulator = reducer?.params[0].name;
  return (
    accumulator !== undefined &&
    isConcatOf(node, accumulator) &&
    isArrayValue(context, object, reducer.parent.arguments[1])
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not concatenate onto an accumulator array on every step of reduce or a loop',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      concat:
        'Concatenating onto the accumulator copies it on every step, so the work grows with the square of the list. Build the result in one pass (`flatMap`, `Object.fromEntries(items.map(...))`, `Object.groupBy`), or push into an array created before the loop. An exception fits only when the list is always tiny.',
      loopConcat:
        'This loop copies `{{name}}` with `concat` on every pass, so the work grows with the square of the list. Build the result in one pass (`flatMap`, `Object.fromEntries(items.map(...))`), or push into an array created before the loop. An exception fits only when the list is always tiny.',
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
        if (isReduceConcat(context, node, reducers)) {
          context.report({ node, messageId: 'concat' });
        }
      },
      AssignmentExpression(node) {
        if (isLoopCopy(context, node)) {
          context.report({ node, messageId: 'loopConcat', data: { name: node.left.name } });
        }
      },
    };
  },
};
